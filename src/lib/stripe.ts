import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
    }
    _stripe = new Stripe(key);
  }
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(
    import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY,
  );
}

export interface RecurringSpec {
  interval: 'month' | 'year';
  interval_count?: number;
}

/**
 * Stripe has no "quarter" interval — it is three months.
 */
export function recurringFor(
  isSubscription: boolean | undefined,
  interval: 'month' | 'quarter' | 'year' | undefined,
): RecurringSpec | undefined {
  if (!isSubscription) return undefined;
  if (interval === 'year') return { interval: 'year' };
  if (interval === 'quarter') return { interval: 'month', interval_count: 3 };
  return { interval: 'month' };
}

/**
 * The account (or sandbox) the configured key belongs to.
 *
 * Stripe sandboxes each have their own keys and their own data, so an ID copied
 * from the wrong sandbox's dashboard reads as "no such product". Surfacing the
 * account in that error turns a confusing dead end into an obvious mismatch.
 */
export async function getAccountLabel(): Promise<string | null> {
  try {
    const account = await getStripe().accounts.retrieve();
    const name = account.settings?.dashboard?.display_name;
    return name ? `${account.id} (${name})` : account.id;
  } catch {
    return null;
  }
}

export function isStripeProductId(value: string): boolean {
  return /^prod_[A-Za-z0-9]+$/.test(value);
}

/**
 * Confirms a Stripe product exists and returns its name, so the admin can see
 * it is pointing at the right thing rather than a typo'd ID.
 */
export async function describeProduct(
  productId: string,
): Promise<{ id: string; name: string; active: boolean }> {
  const product = await getStripe().products.retrieve(productId);
  return { id: product.id, name: product.name, active: product.active };
}

/** Create a price against a known Stripe product. */
export async function createPrice(spec: {
  productId: string;
  unitAmount: number;
  currency?: string;
  recurring?: RecurringSpec;
  /** Stripe's "nickname" — the Description column in the dashboard. */
  nickname?: string;
}): Promise<string> {
  const created = await getStripe().prices.create({
    product: spec.productId,
    currency: spec.currency ?? 'usd',
    unit_amount: spec.unitAmount,
    ...(spec.recurring ? { recurring: spec.recurring } : {}),
    ...(spec.nickname ? { nickname: spec.nickname } : {}),
  });
  return created.id;
}

/**
 * A nickname is one of the few mutable fields on a Price, so renaming never
 * needs a new price object.
 */
export async function updatePriceNickname(
  priceId: string,
  nickname: string,
): Promise<boolean> {
  try {
    await getStripe().prices.update(priceId, { nickname });
    return true;
  } catch {
    return false;
  }
}

/**
 * Best-effort archive of a superseded price.
 *
 * This must never fail the save: the replacement price already exists, and the
 * old ID may be a placeholder that Stripe has never heard of. Returns whether
 * it actually archived anything.
 */
export async function archivePrice(priceId: string): Promise<boolean> {
  try {
    await getStripe().prices.update(priceId, { active: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * Makes Stripe match the amount the admin is showing.
 *
 * The stored price ID is only reusable if it is a real, active price on THIS
 * product for exactly this amount and cadence. Anything else — a placeholder ID,
 * a price left over from a different Stripe product, or simply a different
 * amount — means a new price has to be created. Reusing a matching price keeps
 * saves idempotent, so pressing Save twice does not litter Stripe with
 * duplicates.
 */
export async function ensurePrice(spec: {
  productId: string;
  currentPriceId: string;
  unitAmount: number;
  recurring?: RecurringSpec;
  nickname?: string;
}): Promise<{ priceId: string; created: boolean; renamed: boolean }> {
  const stripe = getStripe();

  try {
    const existing = await stripe.prices.retrieve(spec.currentPriceId);
    const onThisProduct =
      (typeof existing.product === 'string' ? existing.product : existing.product.id) ===
      spec.productId;
    const amountMatches = existing.unit_amount === spec.unitAmount;
    const cadenceMatches =
      (existing.recurring?.interval ?? null) === (spec.recurring?.interval ?? null) &&
      (existing.recurring?.interval_count ?? null) ===
        (spec.recurring?.interval_count ?? null);

    if (existing.active && onThisProduct && amountMatches && cadenceMatches) {
      // The amount is right, so keep the price object and just correct its
      // label if the description changed — no new price needed.
      let renamed = false;
      const wanted = spec.nickname ?? '';
      if (wanted && (existing.nickname ?? '') !== wanted) {
        renamed = await updatePriceNickname(spec.currentPriceId, wanted);
      }
      return { priceId: spec.currentPriceId, created: false, renamed };
    }
  } catch {
    // Unknown or placeholder ID — fall through and create a real one.
  }

  const priceId = await createPrice({
    productId: spec.productId,
    unitAmount: spec.unitAmount,
    recurring: spec.recurring,
    nickname: spec.nickname,
  });
  await archivePrice(spec.currentPriceId);
  return { priceId, created: true, renamed: false };
}

/**
 * Points the Stripe product's "default price" at what the site charges, so the
 * dashboard does not keep advertising a stale amount. Best effort: failing here
 * must not fail the save, since the default price is cosmetic — checkout always
 * charges the specific price ID we store.
 */
export async function setDefaultPrice(
  productId: string,
  priceId: string,
): Promise<boolean> {
  try {
    await getStripe().products.update(productId, { default_price: priceId });
    return true;
  } catch {
    return false;
  }
}

/**
 * Stripe Prices are immutable, so "changing a price" means creating a new one
 * against the same Stripe Product and archiving the old.
 *
 * Checkout charges by price ID (see api/stripe/checkout.ts), so the new ID
 * MUST be persisted or the site would keep charging the old amount. Callers
 * save the returned ID before reporting success.
 *
 * Used when a product has no explicit Stripe product ID set: the product is
 * inferred from the price being replaced, which requires that price to be real.
 */
export async function createReplacementPrice(
  oldPriceId: string,
  unitAmount: number,
): Promise<string> {
  const stripe = getStripe();

  const previous = await stripe.prices.retrieve(oldPriceId);
  const productId =
    typeof previous.product === 'string' ? previous.product : previous.product.id;

  const created = await createPrice({
    productId,
    unitAmount,
    currency: previous.currency,
    // Preserve the billing cadence for subscription products (CSA boxes).
    recurring: previous.recurring
      ? {
          interval: previous.recurring.interval as 'month' | 'year',
          interval_count: previous.recurring.interval_count,
        }
      : undefined,
  });

  // Archive only after the replacement exists, so a failure never leaves the
  // product with no active price.
  await archivePrice(oldPriceId);

  return created;
}
