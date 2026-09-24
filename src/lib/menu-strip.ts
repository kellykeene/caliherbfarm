/**
 * The menu strip: extra darkening across the top of a band photo, behind the
 * floating menu. It stacks on the scrim rather than following it, so pushing
 * a photo's brightness up can never wash out the menu, and every step of its
 * slider shows on every page.
 *
 * No imports on purpose: the admin page's browser script uses this too, to
 * preview the strip while its slider moves.
 */

/** A light strip: enough to lift the menu off a bright patch. */
export const DEFAULT_MENU_STRIP = 40;

/** The admin's 0–100 as the strip layer's opacity. */
export function menuStripOpacity(strength: number): number {
  return Math.min(Math.max(strength, 0), 100) / 100;
}
