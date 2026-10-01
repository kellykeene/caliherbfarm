import { defineMiddleware } from 'astro:middleware';
import { isNoindexEnabled } from '@/lib/noindex';

/**
 * A response header rather than a meta tag or robots.txt:
 * - it covers /media images too, which a meta tag cannot
 * - unlike a robots.txt Disallow, it still lets crawlers *read* the directive.
 *   A disallowed URL can stay indexed via inbound links precisely because the
 *   crawler was never allowed to fetch the page and see the noindex.
 */
export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  if (isNoindexEnabled()) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return response;
});
