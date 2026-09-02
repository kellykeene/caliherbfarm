export const prerender = false;

import type { APIRoute } from 'astro';
import { guardApi } from '@/lib/auth';
import {
  ANNOUNCEMENT_MAX,
  readAnnouncement,
  writeAnnouncement,
} from '@/lib/announcement';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

/** Public: the storefront banner reads this on every page load. */
export const GET: APIRoute = async () => {
  const announcement = await readAnnouncement();
  // Never cache: the whole point is that an edit shows up immediately.
  return json(announcement, 200, { 'Cache-Control': 'no-store' });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const denied = guardApi(cookies);
  if (denied) return denied;

  let body: { message?: unknown; enabled?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length > ANNOUNCEMENT_MAX) {
    return json(
      { error: `Message must be ${ANNOUNCEMENT_MAX} characters or fewer.` },
      400,
    );
  }
  const enabled = Boolean(body.enabled) && message.length > 0;

  try {
    const saved = await writeAnnouncement({ message, enabled });
    return json(saved, 200, { 'Cache-Control': 'no-store' });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: `Could not save: ${detail}` }, 500);
  }
};
