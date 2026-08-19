export const prerender = false;

import type { APIRoute } from 'astro';
import { guardApi } from '@/lib/auth';
import {
  getCatalog,
  getCategories,
  saveCategories,
  seedCategories,
  type Category,
} from '@/lib/catalog';
import { RESERVED_CATEGORY_SLUGS, slugify } from '@/lib/constants';
import { deleteKey, KEYS } from '@/lib/store';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function sanitize(input: Record<string, unknown>, existing?: Category): Category | string {
  const label = String(input.label ?? existing?.label ?? '').trim();
  if (!label) return 'Every category needs a name.';
  if (label.length > 60) return 'Category names must be 60 characters or fewer.';

  const slug = existing?.slug ?? slugify(String(input.slug ?? label));
  if (!slug) return 'Could not build a URL from that name — try plain letters.';
  if (RESERVED_CATEGORY_SLUGS.includes(slug)) {
    return `"${slug}" is reserved and cannot be used as a category URL.`;
  }

  const homeOrderRaw = input.homeOrder;
  let homeOrder: number | null;
  if (homeOrderRaw === null || homeOrderRaw === '' || homeOrderRaw === undefined) {
    homeOrder = existing && !('homeOrder' in input) ? existing.homeOrder : null;
  } else {
    const parsed = Number(homeOrderRaw);
    homeOrder = Number.isFinite(parsed) ? parsed : null;
  }

  return {
    slug,
    label,
    blurb: String(input.blurb ?? existing?.blurb ?? '').trim().slice(0, 400),
    primary: Boolean(input.primary ?? existing?.primary ?? false),
    hidden: Boolean(input.hidden ?? existing?.hidden ?? false),
    homeOrder,
    custom: existing?.custom ?? true,
  };
}

export const GET: APIRoute = async ({ cookies }) => {
  const denied = guardApi(cookies);
  if (denied) return denied;
  return json(await getCategories());
};

/** Create one category. */
export const POST: APIRoute = async ({ request, cookies }) => {
  const denied = guardApi(cookies);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'Expected a JSON body.' }, 400);

  const categories = await getCategories();
  const result = sanitize(body);
  if (typeof result === 'string') return json({ error: result }, 400);

  if (categories.some((c) => c.slug === result.slug)) {
    return json({ error: `A category already uses the URL "${result.slug}".` }, 409);
  }

  categories.push(result);
  await saveCategories(categories);
  return json(categories);
};

/** Replace the whole list — this is also how ordering is saved. */
export const PUT: APIRoute = async ({ request, cookies }) => {
  const denied = guardApi(cookies);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  if (!Array.isArray(body)) return json({ error: 'Expected an array.' }, 400);

  const existing = await getCategories();
  const next: Category[] = [];

  for (const raw of body) {
    const match = existing.find((c) => c.slug === raw.slug);
    const result = sanitize(raw, match);
    if (typeof result === 'string') return json({ error: result }, 400);
    if (next.some((c) => c.slug === result.slug)) {
      return json({ error: `Duplicate category URL "${result.slug}".` }, 400);
    }
    next.push(result);
  }

  await saveCategories(next);
  return json(next);
};

/** Delete one category, but never orphan its products. */
export const DELETE: APIRoute = async ({ request, cookies, url }) => {
  const denied = guardApi(cookies);
  if (denied) return denied;

  const slug = url.searchParams.get('slug');
  if (!slug) return json({ error: 'Which category? Pass ?slug=' }, 400);

  if (slug === 'reset') {
    await deleteKey(KEYS.categories);
    return json(seedCategories());
  }

  const products = await getCatalog();
  const assigned = products.filter((p) => p.data.category === slug);
  if (assigned.length > 0) {
    return json(
      {
        error: `${assigned.length} product${assigned.length === 1 ? ' is' : 's are'} still in this category. Move them first.`,
        products: assigned.map((p) => ({ id: p.id, title: p.data.title })),
      },
      409,
    );
  }

  const categories = await getCategories();
  const next = categories.filter((c) => c.slug !== slug);
  if (next.length === categories.length) {
    return json({ error: 'No such category.' }, 404);
  }

  await saveCategories(next);
  return json(next);
};

/** Restore the seed list from constants.ts. */
export const PATCH: APIRoute = async ({ cookies }) => {
  const denied = guardApi(cookies);
  if (denied) return denied;
  await deleteKey(KEYS.categories);
  return json(seedCategories());
};
