export const SITE = {
  name: 'Cali Herb Farm',
  tagline: 'Fresh Herbs & Handmade Remedies',
  description:
    'Small specialty herb farm growing 60+ varieties of medicinal plants. Shop handcrafted tinctures, teas, topicals, and seasonal fresh herbs.',
  url: 'https://caliherbfarm.com',
  email: 'info@caliherbfarm.com',
  location: 'California',
  social: {
    instagram: 'https://instagram.com/caliherbfarm',
    bluesky: 'https://bsky.app/profile/caliherbfarm',
  },
} as const;

export const NAV_LINKS = [
  { label: 'Home', href: '/' },
  {
    label: 'Shop',
    href: '/shop',
    children: [
      { label: 'Remedies', href: '/shop' },
      { label: 'Fresh Herbs', href: '/shop?category=fresh-herbs' },
    ],
  },
  { label: 'Fresh Herbs', href: '/fresh-herbs' },
  { label: 'About', href: '/about' },
] as const;

export const PRODUCT_CATEGORIES = [
  { label: 'All', slug: 'all' },
  { label: 'CSA', slug: 'csa' },
  { label: 'Tincture Formulas', slug: 'tinctures-formulas' },
  { label: 'Single Herb Tinctures', slug: 'tinctures-singles' },
  { label: 'Teas', slug: 'teas' },
  { label: 'Topicals', slug: 'topicals' },
  { label: 'Culinary', slug: 'culinary' },
  { label: 'Fresh Herbs', slug: 'fresh-herbs' },
] as const;
