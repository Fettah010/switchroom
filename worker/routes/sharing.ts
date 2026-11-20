// Share API routes for Switchroom v0.6.0.
//
// Client sharing and guest review. Every route that returns project information,
// creates/revokes a link, or issues a playback URL authorizes on the Worker.
import { Hono, type Context } from 'hono';
import type {
  AssetRole,
  Env,
  OwnerContext,
  ProjectRow,
  ProjectVisibility,
  RetentionDays,
  ShareLinkKind,
} from '../types';
import { resolveProjectOwner } from '../services/auth';
import { getProjectById, updateProject } from '../services/projects';
import {
  validateTokenShape,
  hashToken,
  createShareLink,
  revokeShareLink,
  listShareLinks,
  isLinkActive,
  resolveShareAccess,
  issuePlaybackUrl,
  isPasswordProtectionEnabled,
  hashPassword,
  verifyPassword,
  checkPasswordThrottle,
  recordPasswordAttempt,
  issuePasswordGrant,
  hashAttemptKey,
} from '../services/sharing';

export const sharingRoute = new Hono<{ Bindings: Env }>();

type RequireOwnerResult =
  | { ok: true; project: ProjectRow; owner: OwnerContext }
  | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' };

/** Ensures the caller is the owner of the project (account user or guest capability). */
async function requireOwner(
  c: Context<{ Bindings: Env }>,
  projectId: string,
): Promise<RequireOwnerResult> {
  const project = await getProjectById(c.env.DB, projectId);
  if (!project) {
    return { ok: false, code: 'NOT_FOUND' };
  }
  const owner = await resolveProjectOwner(c, project);
  if (!owner) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  return { ok: true, project, owner };
}

function ownerErrorResponse(c: Context<{ Bindings: Env }>, result: RequireOwnerResult): Response {
  if (!result.ok) {
    const isNotFound = result.code === 'NOT_FOUND';
    return c.json(
      {
        error: {
          code: result.code,
          message: isNotFound ? 'Project not found' : 'Owner access required',
        },
      },
      isNotFound ? 404 : 403,
    );
  }
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
}

/** Validates Origin on state-changing browser requests where an origin is sent. */
function validateOrigin(c: Context<{ Bindings: Env }>): Response | null {
  const origin = c.req.header('Origin');
  if (!origin) return null;
  try {
    const parsed = new URL(origin);
    if (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname.endsWith('.workers.dev') ||
      parsed.hostname.endsWith('switchroom.app')
    ) {
      return null;
    }
    return c.json({ error: { code: 'FORBIDDEN', message: 'Origin not allowed' } }, 403);
  } catch {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Invalid origin' } }, 403);
  }
}

/* ------------------------------------------------------------------ */
/* Client access                                                      */
/* ------------------------------------------------------------------ */

/**
 * Resolves a share token to safe review-page metadata and capabilities.
 * Enforces link/project expiry, revocation, visibility and password state.
 */
sharingRoute.get('/share/:token/access', async (c) => {
  const token = c.req.param('token');
  const grantCookie = readGrantCookie(c);

  try {
    const access = await resolveShareAccess(c.env, token, grantCookie);
    return c.json(
      {
        project: {
          id: access.project.id,
          title: access.project.title,
          description: access.project.description,
          original: {
            label: 'Original',
          },
          edited: {
            label: 'Edited',
          },
          expiresAt: access.project.expires_at,
        },
        capabilities: access.capabilities,
        access: {
          passwordRequired: access.passwordRequired,
          linkExpiresAt: access.linkExpiresAt,
        },
      },
      200,
      {
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        ...(access.project.sharing_visibility === 'public' && access.project.public_indexing_enabled
          ? {}
          : { 'X-Robots-Tag': 'noindex, nofollow, noarchive' }),
      },
    );
  } catch (err: unknown) {
    return shareErrorResponse(c, err);
  }
});

function readGrantCookie(c: Context<{ Bindings: Env }>): string | null {
  const cookieHeader = c.req.header('cookie');
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)(sw_share_grant_[^=]+)=([^;]+)/);
  if (!match) return null;
  const value = match[2];
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function shareErrorResponse(c: Context<{ Bindings: Env }>, err: unknown): Response {
  if (err && typeof err === 'object' && 'code' in err) {
    const e = err as { code?: string; status?: number; message?: string };
    return c.json(
      { error: { code: e.code ?? 'INTERNAL_ERROR', message: e.message ?? 'Link unavailable' } },
      (e.status ?? 500) as StatusCode,
      { 'Cache-Control': 'no-store' },
    );
  }
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to resolve link' } }, 500, {
    'Cache-Control': 'no-store',
  });
}

type StatusCode = 200 | 201 | 400 | 401 | 403 | 404 | 409 | 410 | 429 | 500 | 503;

/**
 * Verifies a share password and issues a short-lived, link-scoped grant cookie.
 * Generic failures avoid revealing which element was incorrect.
 */
sharingRoute.post('/share/:token/password', async (c) => {
  if (!isPasswordProtectionEnabled(c.env)) {
    return c.json(
      { error: { code: 'SHARING_DISABLED', message: 'Password protection is not available' } },
      403,
    );
  }

  const token = c.req.param('token');
  if (!validateTokenShape(token)) {
    return c.json({ error: { code: 'LINK_UNAVAILABLE', message: 'Link unavailable' } }, 404);
  }

  const tokenHash = await hashToken(token);
  const link = await c.env.DB.prepare('SELECT * FROM share_links WHERE token_hash = ?')
    .bind(tokenHash)
    .first<{
      id: string;
      project_id: string;
      revoked_at: number | null;
      expires_at: number | null;
    }>();

  if (!link) {
    return c.json({ error: { code: 'LINK_UNAVAILABLE', message: 'Link unavailable' } }, 404);
  }

  const project = await getProjectById(c.env.DB, link.project_id);
  if (!project || project.deleted_at !== null || project.expires_at <= Date.now()) {
    return c.json({ error: { code: 'LINK_UNAVAILABLE', message: 'Link unavailable' } }, 404);
  }

  if (link.revoked_at !== null && link.revoked_at !== 0) {
    return c.json({ error: { code: 'LINK_UNAVAILABLE', message: 'Link unavailable' } }, 410);
  }
  if (link.expires_at !== null && Date.now() >= link.expires_at) {
    return c.json({ error: { code: 'LINK_UNAVAILABLE', message: 'Link unavailable' } }, 410);
  }

  if (!project.password_hash) {
    return c.json(
      {
        error: {
          code: 'INVALID_INPUT',
          message: 'Password protection is not configured for this link',
        },
      },
      400,
    );
  }

  // Throttle before any expensive hash verification. Key by visitor + link.
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
  const attemptKeyHash = await hashAttemptKey(`${ip}:${link.id}`);
  const throttle = await checkPasswordThrottle(c.env.DB, link.project_id, attemptKeyHash);
  if (!throttle.allowed) {
    return c.json(
      {
        error: {
          code: 'TOO_MANY_ATTEMPTS',
          message: 'Too many password attempts. Try again later.',
          details: { retryAfterMs: throttle.retryAfterMs },
        },
      },
      429,
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const password: string = typeof body.password === 'string' ? body.password : '';
  if (!password || password.length < 8 || password.length > 128) {
    await recordPasswordAttempt(c.env.DB, link.project_id, attemptKeyHash, false);
    return c.json({ error: { code: 'PASSWORD_INVALID', message: 'Invalid password' } }, 401);
  }

  const ok = await verifyPassword(password, project.password_hash);
  await recordPasswordAttempt(c.env.DB, link.project_id, attemptKeyHash, ok);

  if (!ok) {
    return c.json({ error: { code: 'PASSWORD_INVALID', message: 'Invalid password' } }, 401);
  }

  const { cookieValue } = await issuePasswordGrant(c.env.DB, link.project_id, link.id);
  c.header('Set-Cookie', cookieValue, { append: true });
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Playback URLs                                                      */
/* ------------------------------------------------------------------ */

sharingRoute.get('/share/:token/playback/:role', async (c) => {
  const token = c.req.param('token');
  const role = c.req.param('role') as AssetRole;

  if (role !== 'original' && role !== 'edited') {
    return c.json(
      { error: { code: 'INVALID_ROLE', message: 'Role must be original or edited' } },
      400,
    );
  }

  const grantCookie = readGrantCookie(c);
  const origin = new URL(c.req.url).origin;
  try {
    const result = await issuePlaybackUrl(c.env, token, grantCookie, role, origin);
    return c.json(
      {
        url: result.url,
        expiresAt: result.expiresAt,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes,
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (err: unknown) {
    return shareErrorResponse(c, err);
  }
});

/* ------------------------------------------------------------------ */
/* Owner link management                                              */
/* ------------------------------------------------------------------ */

/** Lists safe link metadata for an owner-managed project. */
sharingRoute.get('/projects/:id/links', async (c) => {
  const resolved = await requireOwner(c, c.req.param('id'));
  if (!resolved.ok) return ownerErrorResponse(c, resolved);

  const { project } = resolved;
  const links = await listShareLinks(c.env.DB, project.id);
  const now = Date.now();

  return c.json({
    project: {
      id: project.id,
      title: project.title,
      visibility: project.sharing_visibility,
      public_indexing_enabled: Boolean(project.public_indexing_enabled),
      expires_at: project.expires_at,
    },
    passwordAvailable: isPasswordProtectionEnabled(c.env),
    links: links.map((link) => ({
      id: link.id,
      kind: link.kind,
      scope: link.scope,
      label: link.label,
      expires_at: link.expires_at,
      revoked_at: link.revoked_at,
      created_at: link.created_at,
      active: isLinkActive(link, now, { projectExpired: false }),
    })),
  });
});

interface CreateLinkBody {
  kind?: ShareLinkKind;
  expiresAt?: number | null;
  label?: string | null;
}

/** Creates or rotates a primary link, or creates a private invite link. */
sharingRoute.post('/projects/:id/links', async (c) => {
  const origin = new URL(c.req.url).origin;
  const originCheck = validateOrigin(c);
  if (originCheck) return originCheck;

  const resolved = await requireOwner(c, c.req.param('id'));
  if (!resolved.ok) return ownerErrorResponse(c, resolved);
  const { project } = resolved;

  const body = (await c.req.json().catch(() => ({}))) as CreateLinkBody;
  const kind: ShareLinkKind = body.kind === 'invite' ? 'invite' : 'primary';

  if (kind === 'invite' && project.sharing_visibility !== 'private') {
    return c.json(
      {
        error: {
          code: 'INVALID_INPUT',
          message: 'Invite links are only valid for private projects',
        },
      },
      400,
    );
  }
  if (kind === 'primary' && project.sharing_visibility === 'private') {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'Private projects cannot have a primary link' } },
      400,
    );
  }

  let expiresAt: number | null = null;
  if (body.expiresAt !== undefined && body.expiresAt !== null) {
    expiresAt = Number(body.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return c.json(
        { error: { code: 'INVALID_INPUT', message: 'Link expiry must be a future timestamp' } },
        400,
      );
    }
  }

  try {
    const result = await createShareLink(c.env.DB, origin, project, kind, {
      expiresAt,
      label: body.label ?? null,
    });
    return c.json(
      {
        url: result.url,
        link: {
          id: result.link.id,
          kind: result.link.kind,
          scope: result.link.scope,
          label: result.link.label,
          expires_at: result.link.expires_at,
          created_at: result.link.created_at,
        },
      },
      201,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to create link';
    return c.json({ error: { code: 'INVALID_INPUT', message } }, 400);
  }
});

/** Revokes a specific link idempotently. */
sharingRoute.delete('/projects/:id/links/:linkId', async (c) => {
  const originCheck = validateOrigin(c);
  if (originCheck) return originCheck;

  const resolved = await requireOwner(c, c.req.param('id'));
  if (!resolved.ok) return ownerErrorResponse(c, resolved);

  const linkId = c.req.param('linkId');
  const link = await revokeShareLink(c.env.DB, linkId, c.req.param('id'));
  if (!link) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Link not found' } }, 404);
  }

  return c.json({
    link: {
      id: link.id,
      kind: link.kind,
      active: false,
      revoked_at: link.revoked_at,
    },
  });
});

interface SharingSettingsBody {
  visibility?: ProjectVisibility;
  public_indexing_enabled?: boolean;
  password?: string | null;
  feedback_enabled?: boolean;
  downloads_enabled?: boolean;
}

/** Updates v0.6 sharing settings: visibility, indexing, password. */
sharingRoute.patch('/projects/:id/sharing', async (c) => {
  const originCheck = validateOrigin(c);
  if (originCheck) return originCheck;

  const resolved = await requireOwner(c, c.req.param('id'));
  if (!resolved.ok) return ownerErrorResponse(c, resolved);
  const { project } = resolved;

  const body = (await c.req.json().catch(() => ({}))) as SharingSettingsBody;
  const updates: Record<string, unknown> = {};

  if (body.visibility !== undefined) {
    if (
      body.visibility !== 'public' &&
      body.visibility !== 'unlisted' &&
      body.visibility !== 'private'
    ) {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'Invalid visibility' } }, 400);
    }
    // Changing away from private revokes the primary link; changing to private
    // requires an explicit invite step and does not publish the project.
    if (project.sharing_visibility === 'private' && body.visibility !== 'private') {
      // Require explicit link creation; do not silently publish.
    }
    if (body.visibility === 'private' && project.sharing_visibility !== 'private') {
      const primary = await c.env.DB.prepare(
        "SELECT id FROM share_links WHERE project_id = ? AND kind = 'primary' AND (revoked_at IS NULL OR revoked_at = 0)",
      )
        .bind(project.id)
        .first();
      if (primary) {
        await revokeShareLink(c.env.DB, primary.id as string, project.id);
      }
    }
    updates.visibility = body.visibility;
  }

  if (body.public_indexing_enabled !== undefined) {
    const effectiveVisibility = body.visibility ?? project.sharing_visibility;
    const indexing = effectiveVisibility === 'public' && Boolean(body.public_indexing_enabled);
    updates.public_indexing_enabled = indexing ? 1 : 0;
  } else if (body.visibility !== undefined && body.visibility !== 'public') {
    updates.public_indexing_enabled = 0;
  }

  if (body.feedback_enabled !== undefined) {
    updates.feedback_enabled = Boolean(body.feedback_enabled);
  }

  if (body.downloads_enabled !== undefined) {
    updates.downloads_enabled = Boolean(body.downloads_enabled);
  }

  if (body.password !== undefined) {
    if (!isPasswordProtectionEnabled(c.env)) {
      return c.json(
        { error: { code: 'SHARING_DISABLED', message: 'Password protection is not available' } },
        403,
      );
    }
    if (body.password === null) {
      updates.password_hash = null;
    } else if (typeof body.password === 'string') {
      if (body.password.length < 8 || body.password.length > 128) {
        return c.json(
          {
            error: {
              code: 'INVALID_INPUT',
              message: 'Password must be between 8 and 128 characters',
            },
          },
          400,
        );
      }
      updates.password_hash = await hashPassword(body.password);
    } else {
      return c.json({ error: { code: 'INVALID_INPUT', message: 'Invalid password value' } }, 400);
    }
  }

  if (Object.keys(updates).length === 0) {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'No sharing settings to update' } },
      400,
    );
  }

  // Changing or removing the password invalidates any outstanding link-scoped
  // verification grants; they must be re-earned under the new password.
  if (updates.password_hash !== undefined) {
    await c.env.DB.prepare('DELETE FROM share_password_grants WHERE project_id = ?')
      .bind(project.id)
      .run();
  }

  try {
    const updateData: {
      title?: string;
      description?: string;
      retentionDays?: RetentionDays;
      crossfadeMs?: number;
      presentationLayout?: string;
      visibility?: ProjectVisibility;
      publicIndexingEnabled?: boolean;
      passwordHash?: string | null;
      feedbackEnabled?: boolean;
      downloadsEnabled?: boolean;
    } = {
      title: undefined,
      description: undefined,
      retentionDays: undefined,
      crossfadeMs: undefined,
      presentationLayout: undefined,
    };

    if (updates.visibility !== undefined) {
      updateData.visibility = updates.visibility as ProjectVisibility;
    }
    if (updates.public_indexing_enabled !== undefined) {
      updateData.publicIndexingEnabled = Boolean(updates.public_indexing_enabled);
    }
    if (updates.password_hash !== undefined) {
      updateData.passwordHash = updates.password_hash as string | null;
    }
    if (updates.feedback_enabled !== undefined) {
      updateData.feedbackEnabled = Boolean(updates.feedback_enabled);
    }
    if (updates.downloads_enabled !== undefined) {
      updateData.downloadsEnabled = Boolean(updates.downloads_enabled);
    }

    const updated = await updateProject(c.env.DB, project.id, updateData);
    return c.json({
      project: { ...updated, owner_capability_hash: undefined, password_hash: undefined },
    });
  } catch (err: unknown) {
    return c.json(
      {
        error: {
          code: 'INVALID_INPUT',
          message: err instanceof Error ? err.message : 'Unable to update sharing settings',
        },
      },
      400,
    );
  }
});

export default sharingRoute;
