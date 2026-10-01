import { defineConfig, envField } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import netlify from '@astrojs/netlify';

export default defineConfig({
  site: 'https://caliherbfarm.com',
  // Server-rendered: the storefront reads live categories, product overrides,
  // and the announcement from Netlify Blobs on every request.
  output: 'server',
  adapter: netlify(),
  // Secrets are read at runtime through astro:env/server, never import.meta.env.
  // Any import.meta.env access in server code is inlined at build time (a
  // dynamic import.meta.env[name] inlines the whole environment), which put
  // keys in the deploy output and tripped Netlify's secrets scanning.
  env: {
    schema: {
      STRIPE_SECRET_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      STRIPE_WEBHOOK_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      ADMIN_PASSWORD_HASH: envField.string({ context: 'server', access: 'secret', optional: true }),
      ADMIN_SESSION_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      SITE_NOINDEX: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
