import { Hono } from 'hono';
import type { Env } from '../types';
import { createAuth, getAuthenticatedUser } from '../services/auth';

export const authRoute = new Hono<{ Bindings: Env }>();

/** Exposes which auth providers are currently configured on the server. */
authRoute.get('/auth/providers', (c) => {
  const hasGitHub = Boolean(c.env.GITHUB_CLIENT_ID && c.env.GITHUB_CLIENT_SECRET);
  const hasGoogle = Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET);

  return c.json({
    guest: true,
    github: hasGitHub,
    google: hasGoogle,
    authAvailable: Boolean(c.env.DB && (hasGitHub || hasGoogle)),
  });
});

/** Returns the authenticated user session, or null if unauthenticated. */
authRoute.get('/auth/me', async (c) => {
  const user = await getAuthenticatedUser(c);
  return c.json({ user });
});

/** Mounts all Better Auth handlers (sign-in, callback, session, sign-out). */
authRoute.all('/auth/*', async (c) => {
  if (!c.env.DB) {
    return c.json(
      { error: { code: 'STORAGE_UNAVAILABLE', message: 'Auth database unavailable' } },
      503,
    );
  }
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});
