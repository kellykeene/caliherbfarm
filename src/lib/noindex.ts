import { getSecret } from 'astro:env/server';

/**
 * Pre-launch search-engine block: SITE_NOINDEX=true sends X-Robots-Tag:
 * noindex on every response.
 *
 * This is the one flag that fails *silently* when forgotten: leave it on after
 * launch and the shop simply never appears in search results, with nothing on
 * the site to show why. Hence the banner on every admin page.
 */
export function isNoindexEnabled(): boolean {
  // Runtime lookup via astro:env; see the env schema in astro.config.mjs.
  const value = getSecret('SITE_NOINDEX');
  return value === 'true' || value === '1';
}
