import { KEYS, readJson, writeJson } from './store';

export interface Announcement {
  message: string;
  enabled: boolean;
  updatedAt: string | null;
}

/**
 * Shown when nothing has been saved yet, or when the blob store is
 * unreachable (e.g. `astro dev` outside the Netlify runtime).
 */
export const DEFAULT_ANNOUNCEMENT: Announcement = {
  message: 'Spring CSA boxes are now available! Order yours before the equinox.',
  enabled: true,
  updatedAt: null,
};

export const ANNOUNCEMENT_MAX = 200;

/**
 * Editing the banner must never take the site down, so a failed read degrades
 * to the default rather than throwing.
 */
export async function readAnnouncement(): Promise<Announcement> {
  const saved = await readJson<Announcement | null>(KEYS.announcement, null);
  if (!saved) return DEFAULT_ANNOUNCEMENT;
  return {
    message: String(saved.message ?? DEFAULT_ANNOUNCEMENT.message),
    enabled: Boolean(saved.enabled),
    updatedAt: saved.updatedAt ?? null,
  };
}

export async function writeAnnouncement(
  input: Pick<Announcement, 'message' | 'enabled'>,
): Promise<Announcement> {
  const next: Announcement = {
    message: input.message.trim(),
    enabled: input.enabled,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(KEYS.announcement, next);
  return next;
}
