// Better Auth and Guest Ownership resolution for Switchroom v0.5.0

import { betterAuth } from 'better-auth';
import type { Context } from 'hono';
import type { Env, OwnerContext, ProjectRow } from '../types';
import { hashCapability } from './crypto';

/**
 * Creates a request-scoped Better Auth instance bound to the active Worker environment.
 */
export function createAuth(env: Env) {
  if (!env.DB) {
    throw new Error('D1 database binding (DB) is required for auth');
  }

  return betterAuth({
    database: {
      db: env.DB,
      type: 'd1',
    },
    secret: env.BETTER_AUTH_SECRET || 'switchroom-local-development-secret-minimum-32-chars',
    baseURL: env.BETTER_AUTH_URL || 'http://localhost:5173',
    socialProviders: {
      ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: env.GITHUB_CLIENT_ID,
              clientSecret: env.GITHUB_CLIENT_SECRET,
            },
          }
        : {}),
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'],
      },
    },
  });
}

/**
 * Reads the authenticated Better Auth user session from the request headers, if present.
 */
export async function getAuthenticatedUser(
  c: Context<{ Bindings: Env }>,
): Promise<{ id: string; email: string; name: string } | null> {
  if (!c.env?.DB || typeof (c.env.DB as unknown as { prepare?: unknown }).prepare !== 'function') {
    return null;
  }
  try {
    const auth = createAuth(c.env);
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    if (session?.user) {
      return {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      };
    }
  } catch {
    // Unauthenticated or auth session lookup failed
  }
  return null;
}

/**
 * Extracts the guest capability token from request headers, cookies, or query/body.
 */
export function getGuestCapabilityToken(
  c: Context<{ Bindings: Env }>,
  projectId: string,
): string | null {
  // 1. Direct header
  const header = c.req.header('X-Guest-Owner-Capability');
  if (header && header.startsWith('sw_owner_')) {
    return header.trim();
  }

  // 2. Project-scoped cookie
  const cookieHeader = c.req.header('cookie');
  if (cookieHeader) {
    const cookieName = `sw_owner_${projectId}`;
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`));
    if (match?.[1]) {
      try {
        const val = decodeURIComponent(match[1]);
        if (val.startsWith('sw_owner_')) {
          return val;
        }
      } catch {
        // malformed cookie ignored
      }
    }
  }

  return null;
}

/**
 * Authorizes whether the current request is the legitimate owner of the given project.
 * Returns the OwnerContext if authorized, or null if unauthenticated/forbidden.
 */
export async function resolveProjectOwner(
  c: Context<{ Bindings: Env }>,
  project: ProjectRow,
): Promise<OwnerContext | null> {
  // 1. Check account-owned project
  if (project.owner_user_id) {
    const user = await getAuthenticatedUser(c);
    if (user && user.id === project.owner_user_id) {
      return { mode: 'user', userId: user.id };
    }
    return null;
  }

  // 2. Check guest-owned project
  if (project.owner_capability_hash) {
    const rawCapability = getGuestCapabilityToken(c, project.id);
    if (!rawCapability) {
      return null;
    }

    const hashed = await hashCapability(rawCapability);
    if (hashed === project.owner_capability_hash) {
      return {
        mode: 'guest',
        projectId: project.id,
        capabilityHash: project.owner_capability_hash,
      };
    }
  }

  return null;
}
