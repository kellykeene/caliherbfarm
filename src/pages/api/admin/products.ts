export const prerender = false;

import type { APIRoute } from 'astro';
import { guardApi } from '@/lib/auth';
import {
  getCatalog,
  getCatalogProduct,
  getCategories,
  updateProductOverride,
  SLIDING_SCALE_TIERS,
  type ProductOverride,
  type SlidingScale,
  type Variant,
} from '@/lib/catalog';
import {
  archivePrice,
  createPrice,
  createReplacementPrice,
  describeProduct,
  ensurePrice,
  getAccountLabel,
  isStripeConfigured,
  isStripeProductId,
  recurringFor,
  setDefaultPrice,
} from '@/lib/stripe';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const TIER_FALLBACK = {
  low: 'Low income',
  middle: 'Middle income',
  high: 'High income',
} as const;

function parsePrice(value: unknown): number | null {
  const cents = Math.round(Number(value));
  if (!Number.isFinite(cents) || cents < 0 || cents > 100_000_00) return null;
  return cents;
}

export const GET: APIRoute = async ({ cookies }) => {
  const denied = guardApi(cookies);
  if (denied) return denied;

  const products = await getCatalog();
  return json(
    products.map((p) => ({
      id: p.id,
      title: p.data.title,
      category: p.data.category,
      hidden: p.hidden,
      inStock: p.data.inStock,
      priceDisplay: p.data.priceDisplay,
    })),
  );
};

/**
 * Creates the replacement price for one line item.
 *
 * With an explicit Stripe product ID we can create the price directly, which
 * works even when the current price ID is a placeholder. Without one we have to
 * infer the product from the existing price, which requires it to be real.
 */
async function reprice(
  stripeProductId: string | undefined,
  oldPriceId: string,
  cents: number,
  recurring: ReturnType<typeof recurringFor>,
): Promise<string> {
  if (!stripeProductId) {
    return createReplacementPrice(oldPriceId, cents);
  }
  const created = await createPrice({
    productId: stripeProductId,
    unitAmount: cents,
    recurring,
  });
  // Best effort: a placeholder old ID cannot be archived, and that is fine.
  await archivePrice(oldPriceId);
  return created;
}

export const PATCH: APIRoute = async ({ request, cookies }) => {
  const denied = guardApi(cookies);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== 'string') {
    return json({ error: 'Expected a JSON body with an id.' }, 400);
  }

  const product = await getCatalogProduct(body.id);
  if (!product) return json({ error: 'No such product.' }, 404);

  const patch: ProductOverride = {};

  if (typeof body.title === 'string') {
    const title = body.title.trim();
    if (!title) return json({ error: 'Title cannot be empty.' }, 400);
    patch.title = title.slice(0, 120);
  }

  if (typeof body.description === 'string') {
    patch.description = body.description.trim().slice(0, 400);
  }

  if (typeof body.category === 'string') {
    const categories = await getCategories();
    if (!categories.some((c) => c.slug === body.category)) {
      return json({ error: `No category with the URL "${body.category}".` }, 400);
    }
    patch.category = body.category;
  }

  /* ---------------------------------------------------------------- *
   * Stripe product link. Validated against Stripe when possible so a
   * typo surfaces here rather than at the next price change.
   * ---------------------------------------------------------------- */
  let stripeProductId = product.override.stripeProductId;
  let stripeProductName: string | null = null;

  if (typeof body.stripeProductId === 'string') {
    const trimmed = body.stripeProductId.trim();

    if (trimmed === '') {
      patch.stripeProductId = undefined;
      stripeProductId = undefined;
    } else if (!isStripeProductId(trimmed)) {
      return json(
        { error: 'A Stripe product ID looks like "prod_ABC123". Nothing was saved.' },
        400,
      );
    } else {
      if (isStripeConfigured()) {
        try {
          const found = await describeProduct(trimmed);
          stripeProductName = found.name;
          if (!found.active) {
            return json(
              { error: `Stripe product "${found.name}" is archived. Nothing was saved.` },
              400,
            );
          }
        } catch (error) {
          const detail = error instanceof Error ? error.message : 'Unknown error';
          const account = await getAccountLabel();
          const hint = account
            ? ` This site's Stripe key is for account ${account} — if you copied the ID from a different sandbox or account, they do not share data.`
            : '';
          return json(
            {
              error: `Stripe could not find that product: ${detail}.${hint} Nothing was saved.`,
            },
            400,
          );
        }
      }
      patch.stripeProductId = trimmed;
      stripeProductId = trimmed;
    }
  }

  const recurring = recurringFor(
    product.data.isSubscription,
    product.data.subscriptionInterval,
  );

  /** Labels of line items that got a freshly created Stripe price. */
  const pricesCreated: string[] = [];
  /** Labels whose Stripe description was corrected in place. */
  const pricesRenamed: string[] = [];

  const cleanNickname = (value: unknown, fallback: string) => {
    const text = typeof value === 'string' ? value.trim() : '';
    return (text || fallback).slice(0, 100);
  };

  if (typeof body.hidden === 'boolean') patch.hidden = body.hidden;
  if (typeof body.inStock === 'boolean') patch.inStock = body.inStock;
  if (typeof body.priceDisplay === 'string') {
    patch.priceDisplay = body.priceDisplay.trim().slice(0, 60);
  }

  /* ---------------------------------------------------------------- *
   * Price changes go through Stripe, because checkout charges by price
   * ID. A failure here must not save anything, or the site would show a
   * price it cannot charge.
   * ---------------------------------------------------------------- */
  if (Array.isArray(body.variants)) {
    const current: Variant[] = product.data.variants ?? [];
    if (current.length === 0) {
      return json({ error: 'This product has no variants to price.' }, 400);
    }

    const nextVariants: Variant[] = current.map((variant, index) => {
      const incoming = body.variants[index];
      if (!incoming) return { ...variant };

      const cents = parsePrice(incoming.price);
      if (cents === null) {
        return { ...variant };
      }
      return {
        ...variant,
        price: cents,
        inStock:
          typeof incoming.inStock === 'boolean' ? incoming.inStock : variant.inStock,
        stripeNickname: cleanNickname(incoming.stripeNickname, variant.label),
      };
    });

    const changed = nextVariants.some((v, i) => v.price !== current[i].price);

    // With a linked Stripe product we reconcile on EVERY save, not just when
    // the number changed: the stored ID may be a placeholder, or Stripe may
    // simply be out of step with what the shop is advertising.
    if (stripeProductId) {
      for (const [index, variant] of nextVariants.entries()) {
        try {
          const result = await ensurePrice({
            productId: stripeProductId,
            currentPriceId: current[index].stripePriceId,
            unitAmount: variant.price,
            recurring,
            nickname: variant.stripeNickname,
          });
          variant.stripePriceId = result.priceId;
          if (result.created) pricesCreated.push(variant.label);
          if (result.renamed) pricesRenamed.push(variant.label);
        } catch (error) {
          const detail = error instanceof Error ? error.message : 'Unknown error';
          return json(
            {
              error: `Stripe rejected the price for "${variant.label}": ${detail}. Nothing was saved.`,
            },
            502,
          );
        }
      }
      await setDefaultPrice(stripeProductId, nextVariants[0].stripePriceId);
    } else if (changed) {
      if (!isStripeConfigured()) {
        return json(
          {
            error:
              'STRIPE_SECRET_KEY is not set, so prices cannot be changed. Nothing was saved.',
          },
          503,
        );
      }
      for (const [index, variant] of nextVariants.entries()) {
        if (variant.price === current[index].price) continue;
        try {
          variant.stripePriceId = await reprice(
            stripeProductId,
            current[index].stripePriceId,
            variant.price,
            recurring,
          );
          pricesCreated.push(variant.label);
        } catch (error) {
          const detail = error instanceof Error ? error.message : 'Unknown error';
          return json(
            {
              error: `Stripe rejected the new price for "${variant.label}": ${detail}. Nothing was saved.`,
            },
            502,
          );
        }
      }
    }

    patch.variants = nextVariants;

    // Keep the headline price in step with the cheapest variant.
    const lowest = Math.min(...nextVariants.map((v) => v.price));
    patch.price = lowest;
    if (patch.priceDisplay === undefined) {
      patch.priceDisplay =
        nextVariants.length > 1
          ? `from $${(lowest / 100).toFixed(2)}`
          : `$${(lowest / 100).toFixed(2)}`;
    }
  }

  /* ---------------------------------------------------------------- *
   * Sliding-scale tiers (CSA boxes). Same rule as variants: Stripe first,
   * and a failure saves nothing. These are subscription prices, and
   * createReplacementPrice carries the recurring interval across.
   * ---------------------------------------------------------------- */
  if (body.slidingScale && typeof body.slidingScale === 'object') {
    const current = product.data.slidingScale as SlidingScale | undefined;
    if (!current) {
      return json({ error: 'This product has no sliding scale to price.' }, 400);
    }

    const next: SlidingScale = {
      low: { ...current.low },
      middle: { ...current.middle },
      high: { ...current.high },
    };

    const changes: { tier: (typeof SLIDING_SCALE_TIERS)[number]; cents: number }[] = [];
    for (const tier of SLIDING_SCALE_TIERS) {
      const incoming = body.slidingScale[tier];
      if (!incoming) continue;
      const cents = parsePrice(incoming.price);
      if (cents === null) {
        return json({ error: `"${tier}" is not a valid price.` }, 400);
      }
      if (cents !== current[tier].price) {
        changes.push({ tier, cents });
        next[tier].price = cents;
      }
      next[tier].stripeNickname = cleanNickname(
        incoming.stripeNickname,
        TIER_FALLBACK[tier],
      );
    }

    // The tiers are a ladder — a middle tier below the low tier would be
    // nonsense to a shopper, so reject it rather than publish it.
    if (!(next.low.price <= next.middle.price && next.middle.price <= next.high.price)) {
      return json(
        {
          error:
            'Tiers must not decrease: low must be at or below middle, and middle at or below high. Nothing was saved.',
        },
        400,
      );
    }

    if (stripeProductId) {
      for (const tier of SLIDING_SCALE_TIERS) {
        try {
          const result = await ensurePrice({
            productId: stripeProductId,
            currentPriceId: current[tier].stripePriceId,
            unitAmount: next[tier].price,
            recurring,
            nickname: next[tier].stripeNickname,
          });
          next[tier].stripePriceId = result.priceId;
          if (result.created) pricesCreated.push(tier);
          if (result.renamed) pricesRenamed.push(tier);
        } catch (error) {
          const detail = error instanceof Error ? error.message : 'Unknown error';
          return json(
            {
              error: `Stripe rejected the ${tier} price: ${detail}. Nothing was saved.`,
            },
            502,
          );
        }
      }
      await setDefaultPrice(stripeProductId, next.low.stripePriceId);
    } else if (changes.length > 0) {
      if (!isStripeConfigured()) {
        return json(
          {
            error:
              'STRIPE_SECRET_KEY is not set, so prices cannot be changed. Nothing was saved.',
          },
          503,
        );
      }

      for (const change of changes) {
        try {
          next[change.tier].stripePriceId = await reprice(
            stripeProductId,
            current[change.tier].stripePriceId,
            change.cents,
            recurring,
          );
          pricesCreated.push(change.tier);
        } catch (error) {
          const detail = error instanceof Error ? error.message : 'Unknown error';
          return json(
            {
              error: `Stripe rejected the new ${change.tier} price: ${detail}. Nothing was saved.`,
            },
            502,
          );
        }
      }
    }

    patch.slidingScale = next;
    patch.price = next.low.price;
    if (patch.priceDisplay === undefined) {
      patch.priceDisplay = `from $${(next.low.price / 100).toFixed(2)}`;
    }
  }

  const saved = await updateProductOverride(body.id, patch);
  return json({
    ok: true,
    id: body.id,
    override: saved,
    stripeProductName,
    pricesCreated,
    pricesRenamed,
  });
};
