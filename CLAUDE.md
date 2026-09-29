# CLAUDE.md

## Dev Server
- Start the site with `npm run dev` (`astro dev`). The `@astrojs/netlify` adapter runs a local Netlify Blobs emulator backed by `.netlify/blobs-serve`. Don't use `netlify dev`: it injects its own blob context, so storefront reads come back empty.
- Product photos, page backgrounds, categories and the announcement all come from Blobs. If they suddenly show placeholders, suspect the environment before the code.
- The blob emulator doesn't survive Vite's in-place restart, which fires when `package.json`, `.env` or `astro.config.mjs` changes. The log shows "Multiple instances of @netlify/vite-plugin have been loaded". Avoid editing those files while the server is running. If you do edit them, stop every dev server, start a fresh `npm run dev`, and check that images load again.

## Astro ClientRouter
- The site uses Astro's ClientRouter (view transitions), which swaps the DOM on navigation without re-running module scripts.
- Scripts that bind to page elements (hamburger menu, scroll-reveal logo, etc.) must set up on the `astro:page-load` event, not just once on first load.
- Delegated listeners on `document` are the exception. `document` persists across navigations, so bind them once at module level and look up elements at event time. Re-binding them on each page load would stack duplicates (see `QuickViewModal.astro`).

## Admin Settings
- When adding admin sliders or settings, use names that are unambiguous and clearly tied to the target page.
- Admin previews must render the real header and menu so settings like "Darken behind the menu" can be seen.
- Confirm which page or record a setting saves to before building it.

## Browser Verification
- Before resizing the window for responsive checks, make sure DevTools device emulation is off.
- Keep the verification tab in the foreground, because backgrounded tabs suspend rendering.
- Verify mobile at 375px and check the nav breakpoint.
