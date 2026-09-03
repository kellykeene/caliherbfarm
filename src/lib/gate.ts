import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';

/**
 * Site-wide "not launched yet" gate.
 *
 * Deliberately separate from the admin login: this hides the storefront from
 * the public while the shop is being filled in, whereas admin auth protects
 * the ability to change things. Admin stays reachable without passing the
 * gate, so there is only ever one password to type.
 *
 * The gate is ON when SITE_PASSWORD is set and OFF when it is not — removing
 * the variable is the launch switch.
 */

export const GATE_COOKIE = 'chf_gate';
const GATE_DAYS = 30;

function env(name: string): string | undefined {
  return import.meta.env[name] || process.env[name];
}

export function gatePassword(): string | undefined {
  const value = env('SITE_PASSWORD');
  return value && value.trim() ? value.trim() : undefined;
}

export function isGateEnabled(): boolean {
  return Boolean(gatePassword());
}

/**
 * Pre-launch search-engine block, independent of the password gate — you can
 * have either, both, or neither.
 *
 * This is the one flag that fails *silently* when forgotten: leave it on after
 * launch and the shop simply never appears in search results, with nothing on
 * the site to show why. Hence the banner on every admin page.
 */
export function isNoindexEnabled(): boolean {
  const value = env('SITE_NOINDEX');
  return value === 'true' || value === '1';
}

/**
 * Signs with the admin secret when there is one, so the gate cookie cannot be
 * forged from the password alone. Falls back to the password itself so the
 * gate still works if it is the only thing configured.
 */
function secret(): string {
  return env('ADMIN_SESSION_SECRET') || `gate:${gatePassword() ?? ''}`;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

export function createGateToken(): string {
  const expires = Date.now() + GATE_DAYS * 24 * 60 * 60 * 1000;
  return `${expires}.${sign(`gate|${expires}`)}`;
}

export function isValidGateToken(token: string | undefined): boolean {
  if (!token) return false;
  const [expiresRaw, signature] = token.split('.');
  const expires = Number(expiresRaw);
  if (!expiresRaw || !signature || !Number.isFinite(expires)) return false;
  if (Date.now() > expires) return false;

  const expected = Buffer.from(sign(`gate|${expires}`), 'hex');
  const actual = Buffer.from(signature, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function verifyGatePassword(input: string): boolean {
  const expected = gatePassword();
  if (!expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function setGateCookie(cookies: AstroCookies, token: string, secure: boolean) {
  cookies.set(GATE_COOKIE, token, {
    httpOnly: true,
    secure,
    // 'lax' so returning from Stripe's hosted checkout still carries the
    // cookie; 'strict' would drop it on that cross-site navigation and
    // bounce the customer back to the gate mid-purchase.
    sameSite: 'lax',
    path: '/',
    maxAge: GATE_DAYS * 24 * 60 * 60,
  });
}

/** Only same-origin paths, so ?to= cannot be used as an open redirect. */
export function safeRedirectPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  return value;
}
