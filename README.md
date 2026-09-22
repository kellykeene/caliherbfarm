# Cali Herb Farm

The storefront for **Cali Herb Farm** — a small specialty herb farm in California
growing 60+ varieties of medicinal plants and making them into remedies by hand.

The site sells whole dried herbs, small-batch tea blends, tinctures (single-herb
and multi-herb formulas), face & body care, culinary preparations, seasonal
fresh herbs, and CSA boxes. Everything begins with seed planted, tended, and
harvested on the farm; the growing side is organic, with no synthetic
pesticides, herbicides, or fertilizers.

Live at [caliherbfarm.com](https://caliherbfarm.com).

## Tech stack

| Layer | What we use |
| --- | --- |
| Framework | [Astro 6](https://astro.build) in `output: 'server'` (SSR) mode |
| Styling | [Tailwind CSS 4](https://tailwindcss.com) via `@tailwindcss/vite`, with the farm palette defined as `@theme` tokens in `src/styles/global.css` |
| Hosting | [Netlify](https://netlify.com) through `@astrojs/netlify` — the whole app compiles to a single SSR function |
| Payments | [Stripe](https://stripe.com) Checkout (one-time + subscriptions) with a signed webhook endpoint |
| Product catalog | Astro content collections — Markdown files in `src/content/products`, schema-validated with Zod |
| Live settings & media | [Netlify Blobs](https://docs.netlify.com/blobs/overview/) — categories, product overrides, the announcement banner, and uploaded product photos |
| Language | TypeScript (`astro/tsconfigs/strict`), `@/*` aliased to `src/*` |
| Node | 22 (see `.nvmrc`) |

Why SSR rather than a static build: the storefront reads live categories,
product overrides, and the announcement banner from Netlify Blobs on every
request, so an admin edit shows up without a redeploy.

## How the content works

There are two sources of truth, on purpose:

- **The repo** holds each product as Markdown with frontmatter (price, SKU,
  variants, sliding-scale tiers, Stripe price IDs, tags). `src/content.config.ts`
  validates it at build time, so a typo fails the build rather than the
  storefront. `src/lib/constants.ts` seeds the initial category list.
- **Netlify Blobs** holds what the farm edits day to day through `/admin`:
  category order and visibility, per-product overrides, uploaded photos, and the
  announcement banner. Once something is saved in the admin, it wins over the
  repo defaults. Every blob read falls back to the repo values rather than
  throwing, so a storage hiccup can't take the shop down.

`src/lib/catalog.ts` merges the two and is what the pages actually read.

## Project layout

```
src/
  components/      # UI by area: global, home, product, shop, herbs, seo
  content/products # one Markdown file per product
  layouts/         # BaseLayout (storefront) and AdminLayout
  lib/             # catalog, store (Blobs), stripe, cart, auth, gate, media, schema
  pages/
    admin/         # password-protected product, category, announcement editors
    api/           # admin, stripe (checkout + webhook), newsletter, gate
    media/         # serves uploaded product images out of Blobs
    shop/          # index, category pages, product detail
  middleware.ts    # pre-launch password gate + noindex header
scripts/
  hash-password.mjs  # generates the admin password hash and session secret
```

## Getting started

```bash
nvm use            # Node 22
npm install
cp .env.example .env
npm run dev        # http://localhost:4321
```

| Script | Does |
| --- | --- |
| `npm run dev` | Local dev server with HMR |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |

## Environment

Copy `.env.example` and fill it in; the file itself documents each variable.
The essentials:

- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` — checkout and webhooks
- `SITE_URL` — used for Stripe success/cancel redirects
- `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET` — generate both with `node scripts/hash-password.mjs`
- `SITE_PASSWORD` — optional pre-launch gate over the whole storefront; removing it is the launch switch
- `SITE_NOINDEX` — set to `true` before launch to send `X-Robots-Tag: noindex`; **delete it at launch**
- `INSTAGRAM_TOKEN`, `NEWSLETTER_API_KEY` — optional integrations

In production these live in the Netlify UI. Note that several places read
`process.env` as well as `import.meta.env`, because `import.meta.env` is inlined
at build time — a variable added in Netlify after the last build would otherwise
be undefined.

## Admin

`/admin` is protected by a scrypt password hash and a stateless HMAC-signed
session cookie (12 hours, HttpOnly) — no session store to keep in sync. From
there the farm can edit categories, override product details, upload and reorder
product photos (max 10 per product), and set the site announcement.

## Deployment

Push to the branch Netlify is watching. Build settings live in `netlify.toml`
rather than only in the Netlify UI, so they're reviewable and travel with the
repo. There is no `functions` directory on purpose: `@astrojs/netlify` compiles
the entire Astro app into one SSR function that Netlify discovers on its own.

After deploying, point a Stripe webhook at `https://<site>/api/stripe/webhook`
and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
