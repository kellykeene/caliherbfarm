import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import netlify from '@astrojs/netlify';

export default defineConfig({
  site: 'https://caliherbfarm.com',
  // Server-rendered: the storefront reads live categories, product overrides,
  // and the announcement from Netlify Blobs on every request.
  output: 'server',
  adapter: netlify(),
  vite: {
    plugins: [tailwindcss()],
  },
});
