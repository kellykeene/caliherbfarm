export const SITE = {
  name: 'Cali Herb Farm',
  tagline: 'Fresh Herbs & Handmade Remedies',
  description:
    'Small specialty herb farm growing 60+ varieties of medicinal plants. Shop whole dried herbs, tea blends, seasonal fresh herbs, and face & body care.',
  url: 'https://caliherbfarm.com',
  email: 'info@caliherbfarm.com',
  location: 'California',
  social: {
    instagram: 'https://instagram.com/caliherbfarm',
    bluesky: 'https://bsky.app/profile/caliherbfarm',
  },
} as const;

/**
 * Seed categories, in their initial shop order.
 *
 * These are used only until something is saved in the admin — after that the
 * live list comes from Netlify Blobs via lib/catalog.ts. Editing this file
 * will NOT change a site that already has saved categories; use the admin, or
 * its "Reset to defaults" button.
 *
 * `primary: true` categories lead the shop nav; the rest sit below.
 * `homeOrder` (when set) places the category on the homepage, low number first.
 */
export const DEFAULT_CATEGORIES = [
  {
    slug: 'whole-dried-herbs',
    label: 'Whole Dried Herbs',
    blurb:
      'Single herbs we grow, harvest at peak, and dry ourselves. Sold whole so you can blend, infuse, and tincture your own.',
    primary: true,
    homeOrder: 1,
  },
  {
    slug: 'tea-blends',
    label: 'Tea Blends',
    blurb:
      'Small-batch blends built from herbs off our own beds, balanced for flavor as much as for effect.',
    primary: true,
    homeOrder: 3,
  },
  {
    slug: 'fresh-herbs',
    label: 'Fresh Herbs',
    blurb:
      'Over 60 medicinal varieties, cut to order in spring and summer. Availability follows the weather, not a calendar.',
    primary: true,
    homeOrder: null,
  },
  {
    slug: 'face-body',
    label: 'Face & Body',
    blurb:
      'Salves, oils, and balms infused with farm-grown herbs. Nothing synthetic, nothing you cannot pronounce.',
    primary: true,
    homeOrder: 2,
  },
  {
    slug: 'tinctures-formulas',
    label: 'Tincture Formulas',
    blurb:
      'Multi-herb extracts formulated for a purpose — sleep, stress, digestion, immunity.',
    primary: false,
    homeOrder: null,
  },
  {
    slug: 'tinctures-singles',
    label: 'Single Herb Tinctures',
    blurb: 'One plant, one extract. Build your own protocol.',
    primary: false,
    homeOrder: null,
  },
  {
    slug: 'culinary',
    label: 'Culinary',
    blurb:
      'Kitchen herbs and preparations — fire cider, vinegars, and seasonings.',
    primary: false,
    homeOrder: null,
  },
  {
    slug: 'csa',
    label: 'CSA Boxes',
    blurb:
      'Community Supported Agriculture shares: a curated box of seasonal remedies, delivered.',
    primary: false,
    homeOrder: null,
  },
] as const;

export function categoryHref(slug: string) {
  return `/shop/${slug}`;
}

/**
 * Products sit under their own /shop/product segment so a product slug can
 * never be ambiguous with a category slug at /shop/<slug>.
 */
export function productHref(slug: string) {
  return `/shop/product/${slug}`;
}

/** Longest message the contact form accepts, enforced on both ends. */
export const CONTACT_MESSAGE_MAX = 1500;

/** Slugs a category may not take, because the routes already mean something. */
export const RESERVED_CATEGORY_SLUGS = ['product', 'all', 'index'];

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
