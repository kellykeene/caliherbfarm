import { defineMiddleware } from 'astro:middleware';
import type { APIContext, MiddlewareNext } from 'astro';
import {
  GATE_COOKIE,
  isGateEnabled,
  isNoindexEnabled,
  isValidGateToken,
} from '@/lib/gate';

/**
 * Paths that stay reachable without the site password.
 *
 * - the gate itself, or there would be nowhere to type the password
 * - Stripe endpoints: webhooks are server-to-server and carry no cookie, so
 *   gating them would silently break order fulfilment
 * - /media: served with year-long immutable cache headers, so gating it risks
 *   the CDN caching a redirect under an image URL
 * - /admin: has its own login already; going through both would mean two
 *   passwords to reach the same place
 */
const OPEN_PREFIXES = [
  '/enter',
  '/api/gate',
  '/api/stripe',
  '/media/',
  '/admin',
  '/api/admin',
  '/_astro/',
  '/favicon',
  '/__forms.html',
];

/**
 * A response header rather than a meta tag or robots.txt:
 * - it covers /media images too, which a meta tag cannot
 * - unlike a robots.txt Disallow, it still lets crawlers *read* the directive.
 *   A disallowed URL can stay indexed via inbound links precisely because the
 *   crawler was never allowed to fetch the page and see the noindex.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await gate(context, next);
  if (isNoindexEnabled()) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return response;
});

async function gate(context: APIContext, next: MiddlewareNext): Promise<Response> {
  if (!isGateEnabled()) return next();

  const path = context.url.pathname;
  if (OPEN_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))) {
    return next();
  }

  if (isValidGateToken(context.cookies.get(GATE_COOKIE)?.value)) {
    return next();
  }

  // Remember where they were headed so the password lands them there.
  const to = encodeURIComponent(path + context.url.search);
  return context.redirect(`/enter?to=${to}`, 302);
}
