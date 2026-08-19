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

export async function deleteKey(key: string): Promise<void> {
  await getStore(STORE).delete(key);
}

export const KEYS = {
  announcement: 'announcement',
  categories: 'categories',
  productOverrides: 'product-overrides',
} as const;
