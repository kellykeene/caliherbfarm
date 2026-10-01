import { KEYS, deleteBlob, readJson, writeBlob, writeJson } from './store';
import { getCategories } from './catalog';
import { DEFAULT_MENU_STRIP } from './menu-strip';

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export interface PageBackground {
  /** Blob key: `page-backgrounds/<pageId>/<uuid>.<ext>`. */
  key: string;
  alt: string;
  /**
   * CSS object-position for the band crop. Banner photos are wide and most
   * phone photos are not, so the admin picks which slice survives.
   */
  focal: string;
  width: number;
  height: number;
  bytes: number;
  updatedAt: string;
}

/** Keyed by page id — see PAGE_IDS and categoryPageId below. */
export type BackgroundMap = Record<string, PageBackground>;

/**
 * Per-page adjustments set in the admin. Kept apart from the upload so they
 * work on the built-in photos too, which have no PageBackground entry.
 */
export interface BackgroundTweak {
  /** Overrides the upload's or the default's crop. */
  focal?: string;
  /** Scrim opacity, 0–100. Absent means the band style's default. */
  tint?: number;
  /**
   * How strongly the photo behind the text is blurred and shaded, 0–100;
   * 0 is off. Absent means DEFAULT_SOFTEN.
   */
  soften?: number;
  /** Darkening behind the menu, 0–100; 0 is off. Absent means DEFAULT_MENU_STRIP. */
  menu?: number;
}

export type TweakMap = Record<string, BackgroundTweak>;

/** What a page actually renders: a photo, or nothing (which means the wash). */
export interface ResolvedBackground {
  src: string;
  alt: string;
  focal: string;
  /** Scrim opacity, 0–100. */
  tint: number;
  /** Softening strength, 0–100; 0 is off. */
  soften: number;
  /** Darkening behind the menu, 0–100; 0 is off. */
  menu: number;
}

/** The look the softening was designed at, mid-slider so it can go either way. */
export const DEFAULT_SOFTEN = 50;

/* ------------------------------------------------------------------ *
 * Scrim
 *
 * The dark wash over a photo that keeps white text readable. Each gradient
 * is written at full strength and dimmed with opacity, so one number — the
 * tint — scales the whole gradient without changing its shape. The default
 * tints reproduce the fixed scrims these bands had before tint existed.
 * ------------------------------------------------------------------ */

export interface Scrim {
  gradient: string;
  defaultTint: number;
}

const SCRIMS = {
  // Home: the logo and a long paragraph sit mid-photo, so the middle stays
  // darker than on the inside pages.
  hero: {
    gradient: 'bg-gradient-to-b from-forest-900 via-forest-900/58 to-forest-900/75',
    defaultTint: 60,
  },
  // Inside pages: darkest at the top, where the menu sits, and again under
  // the title.
  band: {
    gradient: 'bg-gradient-to-b from-forest-900 via-forest-900/43 to-forest-900/93',
    defaultTint: 70,
  },
} satisfies Record<string, Scrim>;

export function scrimFor(pageId: string): Scrim {
  return pageId === 'home' ? SCRIMS.hero : SCRIMS.band;
}

/* ------------------------------------------------------------------ *
 * Page ids
 * ------------------------------------------------------------------ */

/** Pages that exist whatever the catalog looks like. */
export const FIXED_PAGES = [
  { id: 'home', label: 'Home', path: '/', note: 'Full-height photo behind the logo' },
  { id: 'shop', label: 'Shop', path: '/shop', note: 'Landing page above the categories' },
  // Keeps its old id: the page moved from /fresh-herbs, and its saved photo
  // and adjustments are stored under this key.
  { id: 'fresh-herbs', label: 'Harvest Calendar', path: '/harvest-calendar', note: null },
  { id: 'about', label: 'About', path: '/about', note: null },
  { id: 'contact', label: 'Contact', path: '/contact', note: null },
] as const;

export const CATEGORY_PREFIX = 'category:';

export function categoryPageId(slug: string): string {
  return `${CATEGORY_PREFIX}${slug}`;
}

/** Blob keys can't carry the `:` from a category page id. */
function keyPrefix(pageId: string): string {
  return pageId.replace(CATEGORY_PREFIX, 'category-').replace(/[^a-z0-9-]/gi, '-');
}

/**
 * Every id the admin may write to: the fixed pages plus one per category,
 * hidden ones included, so a category keeps its photo while it is off the
 * site. Anything outside this list is rejected by the API.
 */
export async function getPageIds(): Promise<Set<string>> {
  const categories = await getCategories();
  return new Set([
    ...FIXED_PAGES.map((p) => p.id),
    ...categories.map((c) => categoryPageId(c.slug)),
  ]);
}

/* ------------------------------------------------------------------ *
 * Defaults
 *
 * Photos committed to the repo, used until someone uploads a replacement.
 * A page with no default and no upload falls through to the wash, which is
 * a deliberate design, not a missing image.
 * ------------------------------------------------------------------ */

export const DEFAULT_BACKGROUNDS: Record<string, Pick<ResolvedBackground, 'src' | 'alt' | 'focal'>> = {
  home: {
    src: '/anise-hyssop-basket.jpeg',
    alt: 'Anise hyssop harvested in a basket on the farm',
    focal: 'center 40%',
  },
  about: {
    src: '/farm-sunset.jpg',
    alt: 'Sunset over the growing beds and the oak beyond the fence',
    focal: 'center 58%',
  },
  'fresh-herbs': {
    src: '/ashwagandha-dusk.jpg',
    alt: 'Ashwagandha standing against a pale dusk sky',
    focal: 'center 42%',
  },
  [categoryPageId('whole-dried-herbs')]: {
    src: '/echinacea-drying.jpg',
    alt: 'Echinacea blossoms spread on a drying screen',
    focal: 'center 62%',
  },
  [categoryPageId('fresh-herbs')]: {
    src: '/ashwagandha-closeup.jpg',
    alt: 'Silver-green ashwagandha leaves and seed pods up close',
    focal: 'center 46%',
  },
};

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

export async function getBackgrounds(): Promise<BackgroundMap> {
  return readJson<BackgroundMap>(KEYS.pageBackgrounds, {});
}

export async function getTweaks(): Promise<TweakMap> {
  return readJson<TweakMap>(KEYS.pageBackgroundTweaks, {});
}

/** Softening was briefly an on/off switch; a stored `false` means off. */
function softenOf(tweak: BackgroundTweak): number {
  const value: unknown = tweak.soften;
  if (typeof value === 'number') return value;
  return value === false ? 0 : DEFAULT_SOFTEN;
}

export function resolveBackground(
  pageId: string,
  saved: BackgroundMap,
  tweaks: TweakMap,
): ResolvedBackground | null {
  const item = saved[pageId];
  const base = item
    ? { src: `/media/${item.key}`, alt: item.alt, focal: item.focal }
    : DEFAULT_BACKGROUNDS[pageId];
  if (!base) return null;

  const tweak = tweaks[pageId] ?? {};
  return {
    ...base,
    focal: tweak.focal ?? base.focal,
    tint: tweak.tint ?? scrimFor(pageId).defaultTint,
    soften: softenOf(tweak),
    menu: tweak.menu ?? DEFAULT_MENU_STRIP,
  };
}

/** One-page convenience: the storefront only ever needs its own background. */
export async function getBackground(pageId: string): Promise<ResolvedBackground | null> {
  const [saved, tweaks] = await Promise.all([getBackgrounds(), getTweaks()]);
  return resolveBackground(pageId, saved, tweaks);
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

export async function saveBackground(pageId: string, item: PageBackground): Promise<void> {
  const map = await getBackgrounds();
  const previous = map[pageId];
  map[pageId] = item;
  await writeJson(KEYS.pageBackgrounds, map);
  // Crop and brightness were tuned for the photo being replaced.
  await clearTweak(pageId);

  // The list is what the site reads, so it is written first. A leftover blob
  // costs storage; a list entry pointing at deleted bytes is a broken banner.
  if (previous && previous.key !== item.key) {
    await deleteBlob(previous.key).catch(() => {});
  }
}

export async function updateBackground(
  pageId: string,
  changes: Partial<Pick<PageBackground, 'alt'>>,
): Promise<PageBackground | null> {
  const map = await getBackgrounds();
  const item = map[pageId];
  if (!item) return null;

  map[pageId] = { ...item, ...changes, updatedAt: new Date().toISOString() };
  await writeJson(KEYS.pageBackgrounds, map);
  return map[pageId];
}

/** Removing an upload falls the page back to its default, or to the wash. */
export async function removeBackground(pageId: string): Promise<void> {
  const map = await getBackgrounds();
  const item = map[pageId];
  if (!item) return;

  delete map[pageId];
  await writeJson(KEYS.pageBackgrounds, map);
  // The built-in photo it falls back to has its own crop and brightness.
  await clearTweak(pageId);
  await deleteBlob(item.key).catch(() => {});
}

/**
 * Sets or clears crop, brightness, softening and the menu strip. `null`
 * clears a field back to its default: the photo's own crop, the band's tint,
 * DEFAULT_SOFTEN, DEFAULT_MENU_STRIP.
 */
export async function updateTweak(
  pageId: string,
  changes: { focal?: string | null; tint?: number | null; soften?: number | null;
    menu?: number | null;
  },
): Promise<BackgroundTweak> {
  const map = await getTweaks();
  const next: BackgroundTweak = { ...(map[pageId] ?? {}) };
  for (const field of ['focal', 'tint', 'soften', 'menu'] as const) {
    if (changes[field] === null) delete next[field];
    else if (changes[field] !== undefined) (next as Record<string, unknown>)[field] = changes[field];
  }

  if (Object.keys(next).length === 0) delete map[pageId];
  else map[pageId] = next;
  await writeJson(KEYS.pageBackgroundTweaks, map);
  return next;
}

async function clearTweak(pageId: string): Promise<void> {
  const map = await getTweaks();
  if (!(pageId in map)) return;
  delete map[pageId];
  await writeJson(KEYS.pageBackgroundTweaks, map);
}

export function backgroundKey(pageId: string, ext: string): string {
  return `page-backgrounds/${keyPrefix(pageId)}/${crypto.randomUUID()}.${ext}`;
}

export async function storeBackgroundBytes(
  key: string,
  file: File,
): Promise<void> {
  await writeBlob(key, await file.arrayBuffer(), file.type);
}
