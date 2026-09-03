import { defineMiddleware } from 'astro:middleware';
import { GATE_COOKIE, isGateEnabled, isValidGateToken } from '@/lib/gate';

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

export const onRequest = defineMiddleware(async (context, next) => {
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
});
