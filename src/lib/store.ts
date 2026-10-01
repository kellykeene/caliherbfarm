import { getStore } from '@netlify/blobs';

const STORE = 'site-settings';

/**
 * Thin wrapper around Netlify Blobs. Every read degrades to a fallback rather
 * than throwing, so a storage hiccup can never take the storefront down — the
 * site simply falls back to what is baked into the repo.
 */
export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const value = await getStore(STORE).get(key, { type: 'json' });
    return (value as T) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Writes DO throw — the admin needs to know when a save failed. */
export async function writeJson(key: string, value: unknown): Promise<void> {
  await getStore(STORE).setJSON(key, value);
}

/**
 * True when the failure is "there is no blob store here" rather than a real
 * storage error — most often a long-running dev server whose blob emulator
 * has died. Reads hide this behind their fallbacks; writes cannot, so the
 * admin says which of the two it is instead of a generic failure.
 */
export function isBlobsUnavailable(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('has not been configured to use Netlify Blobs')
  );
}

export const BLOBS_UNAVAILABLE_MESSAGE =
  'This dev server has lost its blob storage, so nothing can be saved. Stop every dev server and start a fresh `npm run dev`.';

export async function deleteKey(key: string): Promise<void> {
  await getStore(STORE).delete(key);
}

export const KEYS = {
  announcement: 'announcement',
  categories: 'categories',
  productOverrides: 'product-overrides',
  pageBackgrounds: 'page-backgrounds',
  pageBackgroundTweaks: 'page-background-tweaks',
} as const;

/* ------------------------------------------------------------------ *
 * Binary media
 *
 * Kept in its own store so product photos never sit alongside the JSON
 * settings above. Blobs cannot be queried, so the list of what exists —
 * order, visibility, alt text — lives in the product overrides; this store
 * only holds bytes, keyed by `<productId>/<mediaId>.<ext>`.
 * ------------------------------------------------------------------ */

const MEDIA_STORE = 'product-media';

export async function writeBlob(
  key: string,
  data: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await getStore(MEDIA_STORE).set(key, data, { metadata: { contentType } });
}

export interface BlobResult {
  body: ReadableStream | null;
  contentType: string;
}

/**
 * Strong consistency: the default is eventual, which makes a just-uploaded
 * thumbnail 404 for a moment in the admin.
 */
export async function readBlob(key: string): Promise<BlobResult | null> {
  try {
    const result = await getStore(MEDIA_STORE).getWithMetadata(key, {
      type: 'stream',
      consistency: 'strong',
    });
    if (!result) return null;
    const contentType =
      typeof result.metadata?.contentType === 'string'
        ? result.metadata.contentType
        : 'application/octet-stream';
    return { body: result.data as ReadableStream | null, contentType };
  } catch {
    return null;
  }
}

/** Never throws: a failed delete must not block removing the list entry. */
export async function deleteBlob(key: string): Promise<void> {
  try {
    await getStore(MEDIA_STORE).delete(key);
  } catch {
    // Orphaned bytes are harmless; a dangling list entry is not.
  }
}
