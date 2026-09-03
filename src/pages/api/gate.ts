export const prerender = false;

import type { APIRoute } from 'astro';
import {
  createGateToken,
  isGateEnabled,
  safeRedirectPath,
  setGateCookie,
  verifyGatePassword,
} from '@/lib/gate';

/**
 * Plain form POST rather than fetch, so the gate works even if the page's
 * JavaScript fails — it is the only door into the site while the gate is on.
 */
export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
  if (!isGateEnabled()) return redirect('/', 303);

  const form = await request.formData().catch(() => null);
  const password = String(form?.get('password') ?? '');
  const to = safeRedirectPath(form?.get('to'));

  if (!verifyGatePassword(password)) {
    return redirect(`/enter?error=1&to=${encodeURIComponent(to)}`, 303);
  }

  setGateCookie(cookies, createGateToken(), url.protocol === 'https:');
  return redirect(to, 303);
};
