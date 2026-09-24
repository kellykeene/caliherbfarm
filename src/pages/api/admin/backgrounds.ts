export const prerender = false;

import type { APIRoute } from 'astro';
import { guardApi } from '@/lib/auth';
import {
  backgroundKey,
  getBackground,
  getPageIds,
  removeBackground,
  saveBackground,
  storeBackgroundBytes,
  updateBackground,
  updateTweak,
  type PageBackground,
} from '@/lib/backgrounds';
import { ACCEPTED_MIME, MAX_ALT_LENGTH, MAX_UPLOAD_BYTES, MediaError } from '@/lib/media';
import { BLOBS_UNAVAILABLE_MESSAGE, isBlobsUnavailable } from '@/lib/store';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function fail(error: unknown) {
  if (error instanceof MediaError) return json({ error: error.message }, error.status);
  // Dev server whose blob emulator has died: the write had nowhere to go, which
  // is a setup problem, not something retrying will fix.
  if (isBlobsUnavailable(error)) return json({ error: BLOBS_UNAVAILABLE_MESSAGE }, 503);
  console.error('Background operation failed:', error);
  return json({ error: 'Something went wrong saving that. Try again.' }, 500);
}

const EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/avif': 'avif',
};

/**
 * Only pages that exist may have a background, so a renamed or deleted
 * category cannot leave an entry no admin screen can ever reach again.
 */
async function requirePage(pageId: unknown): Promise<string> {
  if (typeof pageId !== 'string' || !pageId) throw new MediaError('Missing page.');
  const allowed = await getPageIds();
  if (!allowed.has(pageId)) throw new MediaError('No such page.', 404);
  return pageId;
}

/** Percentages only — this goes straight into object-position. */
function cleanFocal(value: unknown, fallback = 'center 50%'): string {
  if (typeof value !== 'string') return fallback;
  return /^center \d{1,3}%$/.test(value) ? value : fallback;
}

/** Whole percentages only — these go straight into CSS. `null` = default. */
function cleanPercent(value: unknown, label: string): number | null {
  if (value === null) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    throw new MediaError(`${label} must be a whole number from 0 to 100.`);
  }
  return n;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const denied = guardApi(cookies);
  if (denied) return denied;

  try {
    const form = await request.formData();
    const pageId = await requirePage(form.get('pageId'));

    const file = form.get('file');
    if (!(file instanceof File)) throw new MediaError('No file was uploaded.');
    if (!ACCEPTED_MIME.has(file.type)) {
      throw new MediaError(`${file.type || 'That file type'} is not a supported image.`);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new MediaError('That image is too large — 5 MB is the limit.');
    }

    const dim = (name: string) => {
      const n = Number(form.get(name));
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    };
    const alt = typeof form.get('alt') === 'string' ? (form.get('alt') as string) : '';

    const key = backgroundKey(pageId, EXT[file.type] ?? 'bin');
    await storeBackgroundBytes(key, file);

    const item: PageBackground = {
      key,
      alt: alt.slice(0, MAX_ALT_LENGTH),
      focal: cleanFocal(form.get('focal')),
      width: dim('width'),
      height: dim('height'),
      bytes: file.size,
      updatedAt: new Date().toISOString(),
    };
    await saveBackground(pageId, item);
    return json({ item });
  } catch (error) {
    return fail(error);
  }
};

export const PATCH: APIRoute = async ({ request, cookies }) => {
  const denied = guardApi(cookies);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const pageId = await requirePage(body.pageId);

    if (typeof body.alt === 'string') {
      const item = await updateBackground(pageId, { alt: body.alt.slice(0, MAX_ALT_LENGTH) });
      if (!item) {
        throw new MediaError('That page is using a built-in photo — upload one to describe it.');
      }
    }

    // Crop, brightness, softening and the menu strip apply to built-in photos
    // as well as uploads.
    if (
      body.focal !== undefined ||
      body.tint !== undefined ||
      body.soften !== undefined ||
      body.menu !== undefined
    ) {
      if (!(await getBackground(pageId))) {
        throw new MediaError('That page has no photo to adjust.');
      }
      await updateTweak(pageId, {
        focal: body.focal === undefined ? undefined : body.focal === null ? null : cleanFocal(body.focal),
        tint: body.tint === undefined ? undefined : cleanPercent(body.tint, 'Brightness'),
        soften: body.soften === undefined ? undefined : cleanPercent(body.soften, 'Softening'),
        menu: body.menu === undefined ? undefined : cleanPercent(body.menu, 'Menu darkening'),
      });
    }

    return json({ background: await getBackground(pageId) });
  } catch (error) {
    return fail(error);
  }
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  const denied = guardApi(cookies);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const pageId = await requirePage(body.pageId);
    await removeBackground(pageId);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
};
