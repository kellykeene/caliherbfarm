export const prerender = false;

import type { APIRoute } from 'astro';
import { readBlob } from '@/lib/store';

/**
 * Fallback for blobs written outside the upload route — `netlify blobs:set`
 * has no way to attach metadata, so images seeded from the CLI would
 * otherwise be served as application/octet-stream.
 */
const TYPE_BY_EXT: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  avif: 'image/avif',
};

/**
 * Serves uploaded product images. Public on purpose — these appear on the
 * storefront — but keys are UUID-based, so nothing is guessable.
 *
 * Blobs has no CDN of its own, so every miss costs a function invocation.
 * The cache headers below let Netlify's edge serve repeats instead. Keys are
 * never rewritten (an edit uploads a new id), so `immutable` is safe.
 */
export const GET: APIRoute = async ({ params }) => {
  const key = params.key;
  if (!key) return new Response('Not found', { status: 404 });

  const blob = await readBlob(key);
  if (!blob || !blob.body) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  const contentType =
    blob.contentType === 'application/octet-stream'
      ? (TYPE_BY_EXT[ext] ?? blob.contentType)
      : blob.contentType;

  return new Response(blob.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Netlify-CDN-Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
