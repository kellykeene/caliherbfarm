export const prerender = false;

import type { APIRoute } from 'astro';
import { guardApi } from '@/lib/auth';
import { getCatalogProduct } from '@/lib/catalog';
import {
  MediaError,
  addMedia,
  removeMedia,
  reorderMedia,
  setAlt,
  setMain,
  setVisible,
} from '@/lib/media';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** Keeps MediaError's own status/message, turns anything else into a 500. */
function fail(error: unknown) {
  if (error instanceof MediaError) return json({ error: error.message }, error.status);
  console.error('Media operation failed:', error);
  return json({ error: 'Something went wrong saving that. Try again.' }, 500);
}

async function requireProduct(productId: unknown): Promise<string> {
  if (typeof productId !== 'string' || !productId) {
    throw new MediaError('Missing product.');
  }
  // Guards against writing media against an id that has no markdown file,
  // which would strand the blobs where the admin can never reach them.
  const product = await getCatalogProduct(productId);
  if (!product) throw new MediaError('No such product.', 404);
  return productId;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const denied = guardApi(cookies);
  if (denied) return denied;

  try {
    const form = await request.formData();
    const productId = await requireProduct(form.get('productId'));
    const file = form.get('file');
    if (!(file instanceof File)) throw new MediaError('No file was uploaded.');

    const alt = typeof form.get('alt') === 'string' ? (form.get('alt') as string) : '';
    const dim = (name: string) => {
      const n = Number(form.get(name));
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    };
    const { media, item } = await addMedia(productId, file, alt, {
      width: dim('width'),
      height: dim('height'),
    });
    return json({ media, item });
  } catch (error) {
    return fail(error);
  }
};

export const PATCH: APIRoute = async ({ request, cookies }) => {
  const denied = guardApi(cookies);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new MediaError('Malformed request.');

    const { op, id, order, visible, alt } = body as Record<string, unknown>;
    const productId = await requireProduct((body as Record<string, unknown>).productId);

    switch (op) {
      case 'reorder': {
        if (!Array.isArray(order)) throw new MediaError('Missing order.');
        return json(await reorderMedia(productId, order.filter((v): v is string => typeof v === 'string')));
      }
      case 'setMain': {
        if (typeof id !== 'string') throw new MediaError('Missing image.');
        return json(await setMain(productId, id));
      }
      case 'setVisible': {
        if (typeof id !== 'string') throw new MediaError('Missing image.');
        return json(await setVisible(productId, id, Boolean(visible)));
      }
      case 'setAlt': {
        if (typeof id !== 'string') throw new MediaError('Missing image.');
        return json(await setAlt(productId, id, typeof alt === 'string' ? alt : ''));
      }
      default:
        throw new MediaError('Unknown operation.');
    }
  } catch (error) {
    return fail(error);
  }
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  const denied = guardApi(cookies);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new MediaError('Malformed request.');
    const { id } = body as Record<string, unknown>;
    const productId = await requireProduct((body as Record<string, unknown>).productId);
    if (typeof id !== 'string') throw new MediaError('Missing image.');

    return json(await removeMedia(productId, id));
  } catch (error) {
    return fail(error);
  }
};
