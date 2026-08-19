export const prerender = false;

import type { APIRoute } from 'astro';
import {
  createSessionToken,
  clearSessionCookie,
  getAuthConfig,
  setSessionCookie,
  verifyPassword,
} from '@/lib/auth';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export const POST: APIRoute = async ({ request, cookies, url }) => {
  const config = getAuthConfig();
  if (!config) {
    return json(
      {
        error:
          'Admin is not configured. Set ADMIN_PASSWORD_HASH and ADMIN_SESSION_SECRET.',
      },
      503,
    );
  }

  let password = '';
  try {
    const body = await request.json();
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  // Constant-ish delay on every attempt, so response time leaks nothing about
  // whether the password was close, and brute forcing stays slow.
  await new Promise((resolve) => setTimeout(resolve, 400));

  if (!password || !verifyPassword(password, config.passwordHash)) {
    return json({ error: 'Incorrect password.' }, 401);
  }

  setSessionCookie(
    cookies,
    createSessionToken(config.sessionSecret),
    url.protocol === 'https:',
  );
  return json({ ok: true });
};

export const DELETE: APIRoute = async ({ cookies }) => {
  clearSessionCookie(cookies);
  return json({ ok: true });
};
