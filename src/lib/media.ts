import {
  MAX_MEDIA_PER_PRODUCT,
  getProductOverrides,
  saveProductOverrides,
  type MediaItem,
  type ProductOverride,
} from './catalog';
import { deleteBlob, writeBlob } from './store';

/** What the browser is allowed to send. It downscales to WebP first; the
 *  others are accepted so a direct API call or an odd browser still works. */
export const ACCEPTED_MIME = new Set([
  'image/webp',
  'image/jpeg',
  'image/png',
  'image/avif',
]);

const EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/avif': 'avif',
};

/** Post-downscale uploads land around 200-400 KB; this is a backstop, and
 *  also keeps us clear of the serverless request body limit. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const MAX_ALT_LENGTH = 200;

export class MediaError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------------ *
 * Reading and writing the list
 * ------------------------------------------------------------------ */

/**
 * All mutations funnel through here so the read-modify-write stays in one
 * place. Returns the product's media list after the change.
 */
async function mutate(
  productId: string,
  fn: (override: ProductOverride) => void,
): Promise<{ media: MediaItem[]; mainMediaId?: string }> {
  const overrides = await getProductOverrides();
  const override = overrides[productId] ?? {};
  override.media ??= [];

  fn(override);

  // Whatever the change was, the main image must still be a real, visible
  // item — deleting or hiding it promotes the first visible one instead.
  const visible = override.media.filter((m) => m.visible);
  const mainStillValid =
    override.mainMediaId && visible.some((m) => m.id === override.mainMediaId);
  if (!mainStillValid) {
    override.mainMediaId = visible[0]?.id;
  }

  overrides[productId] = override;
  await saveProductOverrides(overrides);
  return { media: override.media, mainMediaId: override.mainMediaId };
}

function find(override: ProductOverride, id: string): MediaItem {
  const item = override.media?.find((m) => m.id === id);
  if (!item) throw new MediaError('That image no longer exists.', 404);
  return item;
}

/* ------------------------------------------------------------------ *
 * Operations
 * ------------------------------------------------------------------ */

export async function addMedia(
  productId: string,
  file: File,
  alt: string,
  /** Measured in the browser during downscaling; lets the storefront set
   *  width/height on <img> so images don't shift the layout as they load. */
  dimensions: { width: number; height: number } = { width: 0, height: 0 },
): Promise<{ media: MediaItem[]; item: MediaItem }> {
  if (!ACCEPTED_MIME.has(file.type)) {
    throw new MediaError(`${file.type || 'That file type'} is not a supported image.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new MediaError('That image is too large — 5 MB is the limit.');
  }

  const overrides = await getProductOverrides();
  const existing = overrides[productId]?.media ?? [];
  if (existing.length >= MAX_MEDIA_PER_PRODUCT) {
    throw new MediaError(
      `This product already has ${MAX_MEDIA_PER_PRODUCT} images. Delete one before adding another.`,
    );
  }

  const id = crypto.randomUUID();
  const key = `${productId}/${id}.${EXT[file.type] ?? 'bin'}`;

  // Bytes first: an orphaned blob is harmless, a list entry pointing at
  // nothing is a broken image on the storefront.
  await writeBlob(key, await file.arrayBuffer(), file.type);

  const item: MediaItem = {
    id,
    kind: 'image',
    key,
    alt: alt.slice(0, MAX_ALT_LENGTH),
    visible: true,
    width: dimensions.width,
    height: dimensions.height,
    bytes: file.size,
    uploadedAt: new Date().toISOString(),
  };

  const { media } = await mutate(productId, (o) => {
    o.media!.push(item);
  });
  return { media, item };
}

export async function removeMedia(productId: string, id: string) {
  const overrides = await getProductOverrides();
  const item = overrides[productId]?.media?.find((m) => m.id === id);
  if (item) await deleteBlob(item.key);

  return mutate(productId, (o) => {
    o.media = o.media!.filter((m) => m.id !== id);
  });
}

/** `order` is the full list of ids. Anything missing from it keeps its
 *  relative position at the end, so a stale client can't drop images. */
export async function reorderMedia(productId: string, order: string[]) {
  return mutate(productId, (o) => {
    const byId = new Map(o.media!.map((m) => [m.id, m]));
    const next: MediaItem[] = [];
    for (const id of order) {
      const item = byId.get(id);
      if (item) {
        next.push(item);
        byId.delete(id);
      }
    }
    o.media = [...next, ...byId.values()];
  });
}

export async function setMain(productId: string, id: string) {
  return mutate(productId, (o) => {
    const item = find(o, id);
    // Picking a hidden image as the tile would silently do nothing once the
    // promotion rule below runs, so make the intent explicit.
    item.visible = true;
    o.mainMediaId = id;
  });
}

export async function setVisible(productId: string, id: string, visible: boolean) {
  return mutate(productId, (o) => {
    find(o, id).visible = visible;
  });
}

export async function setAlt(productId: string, id: string, alt: string) {
  return mutate(productId, (o) => {
    find(o, id).alt = alt.slice(0, MAX_ALT_LENGTH);
  });
}
