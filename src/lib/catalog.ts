import { getCollection, type CollectionEntry } from 'astro:content';
import { DEFAULT_CATEGORIES } from './constants';
import { KEYS, readJson, writeJson } from './store';

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export interface Category {
  slug: string;
  label: string;
  blurb: string;
  /** Primary categories lead the shop nav; the rest sit below. */
  primary: boolean;
  hidden: boolean;
  /** Position on the homepage, low first. null = not on the homepage. */
  homeOrder: number | null;
  /** Created in the admin rather than seeded from constants.ts. */
  custom: boolean;
}

export interface Variant {
  label: string;
  price: number;
  stripePriceId: string;
  inStock: boolean;
  /** Shown as the price Description in the Stripe dashboard. */
  stripeNickname?: string;
}

export interface SlidingScaleTier {
  price: number;
  stripePriceId: string;
  /** Shown as the price Description in the Stripe dashboard. */
  stripeNickname?: string;
}

export interface SlidingScale {
  low: SlidingScaleTier;
  middle: SlidingScaleTier;
  high: SlidingScaleTier;
}

/** The tiers, in the order they are shown and priced. */
export const SLIDING_SCALE_TIERS = ['low', 'middle', 'high'] as const;
export type SlidingScaleTierKey = (typeof SLIDING_SCALE_TIERS)[number];

/**
 * Only the fields the admin can change. Anything absent falls through to the
 * markdown file, which stays the source of truth for body copy and history.
 */
export interface ProductOverride {
  hidden?: boolean;
  category?: string;
  title?: string;
  description?: string;
  price?: number;
  priceDisplay?: string;
  inStock?: boolean;
  variants?: Variant[];
  slidingScale?: SlidingScale;
  /**
   * The Stripe Product (prod_...) this listing maps to. When set, new prices
   * are created directly against it, so repricing does not depend on the
   * existing price IDs being real.
   */
  stripeProductId?: string;
}

export type ProductOverrides = Record<string, ProductOverride>;

export interface CatalogProduct {
  id: string;
  hidden: boolean;
  /** Merged view: markdown with overrides applied. */
  data: CollectionEntry<'products'>['data'];
  /** Admin-only fields that have no markdown equivalent, e.g. stripeProductId. */
  override: ProductOverride;
  /** The untouched collection entry, needed to render() the body. */
  entry: CollectionEntry<'products'>;
}

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

export function seedCategories(): Category[] {
  return DEFAULT_CATEGORIES.map((c) => ({
    slug: c.slug,
    label: c.label,
    blurb: c.blurb,
    primary: c.primary,
    hidden: false,
    homeOrder: c.homeOrder ?? null,
    custom: false,
  }));
}

/** Array order IS the shop order. */
export async function getCategories(): Promise<Category[]> {
  const stored = await readJson<Category[] | null>(KEYS.categories, null);
  if (!stored || !Array.isArray(stored) || stored.length === 0) {
    return seedCategories();
  }
  return stored;
}

export async function saveCategories(categories: Category[]): Promise<void> {
  await writeJson(KEYS.categories, categories);
}

export async function getVisibleCategories(): Promise<Category[]> {
  return (await getCategories()).filter((c) => !c.hidden);
}

export async function getHomeCategories(): Promise<Category[]> {
  return (await getVisibleCategories())
    .filter((c) => c.homeOrder !== null)
    .sort((a, b) => (a.homeOrder ?? 0) - (b.homeOrder ?? 0));
}

export function findCategory(categories: Category[], slug: string) {
  return categories.find((c) => c.slug === slug);
}

/* ------------------------------------------------------------------ *
 * Product overrides
 * ------------------------------------------------------------------ */

export async function getProductOverrides(): Promise<ProductOverrides> {
  return readJson<ProductOverrides>(KEYS.productOverrides, {});
}

export async function saveProductOverrides(
  overrides: ProductOverrides,
): Promise<void> {
  await writeJson(KEYS.productOverrides, overrides);
}

export async function updateProductOverride(
  id: string,
  patch: ProductOverride,
): Promise<ProductOverride> {
  const all = await getProductOverrides();
  const next = { ...(all[id] ?? {}), ...patch };
  all[id] = next;
  await saveProductOverrides(all);
  return next;
}

/* ------------------------------------------------------------------ *
 * The merged catalog
 * ------------------------------------------------------------------ */

function mergeProduct(
  entry: CollectionEntry<'products'>,
  override: ProductOverride | undefined,
): CatalogProduct {
  const data = { ...entry.data };

  if (override) {
    if (override.category !== undefined) data.category = override.category as typeof data.category;
    if (override.title !== undefined) data.title = override.title;
    if (override.description !== undefined) data.description = override.description;
    if (override.price !== undefined) data.price = override.price;
    if (override.priceDisplay !== undefined) data.priceDisplay = override.priceDisplay;
    if (override.inStock !== undefined) data.inStock = override.inStock;
    if (override.variants !== undefined) data.variants = override.variants;
    if (override.slidingScale !== undefined) data.slidingScale = override.slidingScale;
  }

  return {
    id: entry.id,
    hidden: Boolean(override?.hidden),
    data,
    override: override ?? {},
    entry,
  };
}

/** Everything, hidden included. For the admin. */
export async function getCatalog(): Promise<CatalogProduct[]> {
  const [entries, overrides] = await Promise.all([
    getCollection('products'),
    getProductOverrides(),
  ]);
  return entries.map((entry) => mergeProduct(entry, overrides[entry.id]));
}

/** Only what shoppers should see: visible products in visible categories. */
export async function getStorefrontCatalog(): Promise<CatalogProduct[]> {
  const [products, categories] = await Promise.all([
    getCatalog(),
    getVisibleCategories(),
  ]);
  const visibleSlugs = new Set(categories.map((c) => c.slug));
  return products.filter((p) => !p.hidden && visibleSlugs.has(p.data.category));
}

export async function getStorefrontProduct(
  id: string,
): Promise<CatalogProduct | undefined> {
  return (await getStorefrontCatalog()).find((p) => p.id === id);
}

export async function getCatalogProduct(
  id: string,
): Promise<CatalogProduct | undefined> {
  return (await getCatalog()).find((p) => p.id === id);
}

/** Featured first, then in-stock, then alphabetical. */
export function sortProducts(products: CatalogProduct[]): CatalogProduct[] {
  return [...products].sort((a, b) => {
    if (a.data.featured !== b.data.featured) return a.data.featured ? -1 : 1;
    if (a.data.inStock !== b.data.inStock) return a.data.inStock ? -1 : 1;
    return a.data.title.localeCompare(b.data.title);
  });
}

export function productsIn(
  products: CatalogProduct[],
  slug: string,
): CatalogProduct[] {
  return sortProducts(products.filter((p) => p.data.category === slug));
}

/* ------------------------------------------------------------------ *
 * Navigation, built from live categories
 * ------------------------------------------------------------------ */

export interface NavLink {
  label: string;
  href: string;
  children?: { label: string; href: string }[];
}

export function buildNavLinks(categories: Category[]): NavLink[] {
  const visible = categories.filter((c) => !c.hidden);
  const primary = visible.filter((c) => c.primary);
  const secondary = visible.filter((c) => !c.primary);

  return [
    { label: 'Home', href: '/' },
    {
      label: 'Shop',
      href: '/shop',
      children: [
        ...primary.map((c) => ({ label: c.label, href: `/shop/${c.slug}` })),
        ...secondary.map((c) => ({ label: c.label, href: `/shop/${c.slug}` })),
        { label: 'Shop All', href: '/shop' },
      ],
    },
    { label: 'Harvest Calendar', href: '/fresh-herbs' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ];
}
