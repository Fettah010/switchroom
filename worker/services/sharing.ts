// Share link model, authorization and password gate for Switchroom v0.6.0.
//
// All access decisions are made here, server-side. The browser never receives
// raw tokens, token digests, object keys or signed URLs as persistent grants.

import type {
  AssetRole,
  Env,
  PlaybackUrlResult,
  ProjectRow,
  ShareAccessResult,
  ShareLinkKind,
  ShareLinkRow,
} from '../types';
import { QUOTA_POLICY } from '../config/quotas';

// Share links are bearer links: possession of the token grants listening.
// 32 random bytes = 256 bits of entropy, URL-safe base64 encoded without padding.
const SHARE_TOKEN_BYTES = 32;
const SHARE_TOKEN_PREFIX = 'shr_';

// A link's own expiry can never exceed the project expiry.
function capLinkExpiry(linkExpiry: number | null, projectExpiry: number): number | null {
  if (linkExpiry === null) return null;
  return Math.min(linkExpiry, projectExpiry);
}

/** Generates a high-entropy share token and its SHA-256 digest. */
export async function generateShareToken(): Promise<{ token: string; tokenHash: string }> {
  const bytes = new Uint8Array(SHARE_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  const token = `${SHARE_TOKEN_PREFIX}${encodeBase64Url(bytes)}`;
  return {
    token,
    tokenHash: await hashToken(token),
  };
}

/** Verifies a raw token against a stored SHA-256 digest. */
export async function verifyShareToken(token: string, tokenHash: string): Promise<boolean> {
  try {
    const computed = await hashToken(token);
    return constantTimeEquals(computed, tokenHash);
  } catch {
    return false;
  }
}

/** SHA-256 hex digest of a raw share token. */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Encodes raw bytes to URL-safe base64 without padding. */
function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Constant-time string comparison to avoid timing leaks on stored digest compare. */
async function constantTimeEquals(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Validates a raw token's shape before any database access. */
export function validateTokenShape(token: string): boolean {
  if (typeof token !== 'string' || !token.startsWith(SHARE_TOKEN_PREFIX)) return false;
  const body = token.slice(SHARE_TOKEN_PREFIX.length);
  if (body.length === 0 || body.length > 128) return false;
  // URL-safe base64 alphabet only.
  return /^[A-Za-z0-9_-]+$/.test(body);
}

/** Builds the canonical share URL for a token, returned only at creation/rotation. */
export function shareUrl(origin: string, token: string): string {
  return new URL(`/review/${token}`, origin).toString();
}

/** Determines whether the project is eligible to be shared. */
export function projectEligibleForSharing(project: ProjectRow): { ok: boolean; reason?: string } {
  if (project.deleted_at !== null) {
    return { ok: false, reason: 'Project is deleted' };
  }
  const now = Date.now();
  if (project.expires_at <= now) {
    return { ok: false, reason: 'Project has expired' };
  }
  if (project.status !== 'ready') {
    return { ok: false, reason: 'Project is not ready for sharing' };
  }
  return { ok: true };
}

/** Checks both audio assets are attached and ready. */
export async function assetsReadyForSharing(
  db: D1Database,
  projectId: string,
): Promise<{
  ok: boolean;
  assets?: Record<
    AssetRole,
    {
      object_key: string;
      mime_type: string;
      size_bytes: number;
      filename: string;
      duration_ms: number | null;
    }
  >;
}> {
  const stmt = db.prepare(
    `SELECT role, object_key, mime_type, size_bytes, filename, duration_ms, status
     FROM audio_assets WHERE project_id = ?`,
  );
  const rows = await stmt.bind(projectId).all<{
    role: AssetRole;
    object_key: string;
    mime_type: string;
    size_bytes: number;
    filename: string;
    duration_ms: number | null;
    status: string;
  }>();
  const byRole: Record<AssetRole, (typeof rows.results)[0] | null> = {
    original: null,
    edited: null,
  };
  for (const row of rows.results || []) {
    byRole[row.role] = row;
  }
  if (!byRole.original || byRole.original.status !== 'ready') {
    return { ok: false };
  }
  if (!byRole.edited || byRole.edited.status !== 'ready') {
    return { ok: false };
  }
  return {
    ok: true,
    assets: {
      original: {
        object_key: byRole.original!.object_key,
        mime_type: byRole.original!.mime_type,
        size_bytes: byRole.original!.size_bytes,
        filename: byRole.original!.filename,
        duration_ms: byRole.original!.duration_ms,
      },
      edited: {
        object_key: byRole.edited!.object_key,
        mime_type: byRole.edited!.mime_type,
        size_bytes: byRole.edited!.size_bytes,
        filename: byRole.edited!.filename,
        duration_ms: byRole.edited!.duration_ms,
      },
    },
  };
}

/**
 * Creates or rotates a share link. Returns the raw token URL once (never stored)
 * plus safe metadata. Throws on ineligibility or invalid input.
 *
 * Invariant: a project has at most one active primary link. Rotation revokes the
 * previous active primary before inserting the replacement.
 */
export async function createShareLink(
  db: D1Database,
  origin: string,
  project: ProjectRow,
  kind: ShareLinkKind,
  opts: {
    expiresAt?: number | null;
    label?: string | null;
  },
): Promise<{ url: string; token: string; link: ShareLinkRow }> {
  const eligible = projectEligibleForSharing(project);
  if (!eligible.ok) {
    throw new Error(eligible.reason ?? 'Project is not eligible for sharing');
  }

  const ready = await assetsReadyForSharing(db, project.id);
  if (!ready.ok) {
    throw new Error('Both Original and Edited assets must be ready before sharing');
  }

  const now = Date.now();
  const linkExpiry = capLinkExpiry(opts.expiresAt ?? null, project.expires_at);
  if (opts.expiresAt !== undefined && opts.expiresAt !== null && linkExpiry === null) {
    throw new Error('Link expiry cannot exceed project expiry');
  }

  const { token, tokenHash } = await generateShareToken();
  const linkId = `link_${crypto.randomUUID().replace(/-/g, '')}`;

  if (kind === 'primary') {
    // A project cannot have more than one active primary link. Revoke the
    // existing active primary atomically before inserting the replacement.
    await db
      .prepare(
        `UPDATE share_links
         SET revoked_at = COALESCE(revoked_at, ?)
         WHERE project_id = ? AND kind = 'primary' AND (revoked_at IS NULL OR revoked_at = 0)
           AND (expires_at IS NULL OR expires_at > ?)`,
      )
      .bind(now, project.id, now)
      .run();
  }

  const insert = db.prepare(
    `INSERT INTO share_links (
      id, project_id, token_hash, kind, scope, label, expires_at, revoked_at, created_at
    ) VALUES (?, ?, ?, ?, 'listen', ?, ?, NULL, ?)`,
  );
  await insert.bind(linkId, project.id, tokenHash, kind, opts.label ?? null, linkExpiry, now).run();

  const link: ShareLinkRow = {
    id: linkId,
    project_id: project.id,
    token_hash: tokenHash,
    kind,
    scope: 'listen',
    label: opts.label ?? null,
    expires_at: linkExpiry,
    revoked_at: null,
    created_at: now,
    last_used_at: null,
  };

  return { url: shareUrl(origin, token), token, link };
}

/**
 * Revokes a link idempotently after verifying owner authority and association.
 * Returns the updated link or null if not found/not owned.
 */
export async function revokeShareLink(
  db: D1Database,
  linkId: string,
  projectId: string,
): Promise<ShareLinkRow | null> {
  const now = Date.now();
  const link = await db
    .prepare('SELECT * FROM share_links WHERE id = ? AND project_id = ?')
    .bind(linkId, projectId)
    .first<ShareLinkRow>();
  if (!link) return null;

  await db
    .prepare('UPDATE share_links SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?')
    .bind(now, linkId)
    .run();

  return {
    ...link,
    revoked_at: link.revoked_at ?? now,
  };
}

/** Lists safe link metadata for an owner-managed project. */
export async function listShareLinks(db: D1Database, projectId: string): Promise<ShareLinkRow[]> {
  const now = Date.now();
  const stmt = db.prepare(
    'SELECT * FROM share_links WHERE project_id = ? ORDER BY created_at DESC',
  );
  const result = await stmt.bind(projectId).all<ShareLinkRow>();
  const links = (result.results || []).map((link) => ({
    ...link,
    active: isLinkActive(link, now, { projectExpired: false }),
  }));
  return links;
}

/** Resolves whether a link is currently active given the clock and project state. */
export function isLinkActive(
  link: ShareLinkRow,
  now: number,
  opts: { projectExpired: boolean },
): boolean {
  if (link.revoked_at !== null && link.revoked_at !== 0) return false;
  if (link.expires_at !== null && now >= link.expires_at) return false;
  if (opts.projectExpired) return false;
  return true;
}

/** Builds a typed error with code and status for share access failures. */
interface ShareError extends Error {
  code: string;
  status: number;
}

function shareError(message: string, code: string, status: number): ShareError {
  const err = new Error(message) as ShareError;
  err.code = code;
  err.status = status;
  return err;
}

/**
 * Full server-side authorization for a share token.
 * Returns safe project metadata + capabilities, or throws a typed error.
 *
 * Steps:
 *   1. Validate token shape.
 *   2. Look up link by digest.
 *   3. Link active, not revoked, not expired.
 *   4. Project exists, not deleted, not expired.
 *   5. Visibility compatibility (private => invite link only).
 *   6. Both assets ready.
 *   7. Password grant verified if password configured.
 */
export async function resolveShareAccess(
  env: Env,
  token: string,
  grantCookie: string | null,
): Promise<ShareAccessResult> {
  if (!validateTokenShape(token)) {
    throw shareError('Link unavailable', 'LINK_UNAVAILABLE', 404);
  }

  const tokenHash = await hashToken(token);
  const link = await env.DB.prepare('SELECT * FROM share_links WHERE token_hash = ?')
    .bind(tokenHash)
    .first<ShareLinkRow>();

  if (!link) {
    throw shareError('Link unavailable', 'LINK_UNAVAILABLE', 404);
  }

  const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL')
    .bind(link.project_id)
    .first<ProjectRow>();

  if (!project) {
    throw shareError('Link unavailable', 'LINK_UNAVAILABLE', 404);
  }

  const now = Date.now();

  // Project expiry is the upper bound on all access.
  if (project.expires_at <= now) {
    throw shareError('Link unavailable', 'PROJECT_EXPIRED', 410);
  }

  // Link revocation / expiry.
  if (link.revoked_at !== null && link.revoked_at !== 0) {
    throw shareError('Link unavailable', 'LINK_UNAVAILABLE', 410);
  }
  if (link.expires_at !== null && now >= link.expires_at) {
    throw shareError('Link unavailable', 'LINK_UNAVAILABLE', 410);
  }

  // Visibility compatibility.
  if (project.sharing_visibility === 'private' && link.kind !== 'invite') {
    throw shareError('Link unavailable', 'LINK_UNAVAILABLE', 404);
  }
  if (project.sharing_visibility !== 'private' && link.kind === 'invite') {
    // Invite links are only meaningful for private projects; treat as unavailable
    // unless the project is private (invite semantics for public/unlisted are not v0.6).
    throw shareError('Link unavailable', 'LINK_UNAVAILABLE', 404);
  }

  // Both assets must be ready before a playable link can be used.
  const ready = await assetsReadyForSharing(env.DB, project.id);
  if (!ready.ok) {
    throw shareError('Project is not ready for playback', 'PROJECT_NOT_READY', 409);
  }

  // Password gate.
  let passwordRequired = false;
  if (project.password_hash) {
    passwordRequired = true;
    const grantOk = await verifyPasswordGrant(env, link.id, project.id, grantCookie);
    if (!grantOk) {
      throw shareError('Password required', 'PASSWORD_REQUIRED', 401);
    }
  }

  return {
    project,
    link: {
      id: link.id,
      project_id: link.project_id,
      token_hash: link.token_hash,
      kind: link.kind,
      scope: link.scope,
      label: link.label,
      expires_at: link.expires_at,
      revoked_at: link.revoked_at,
      created_at: link.created_at,
      last_used_at: link.last_used_at,
    },
    capabilities: {
      listen: true,
      feedback: false,
      downloads: false,
    },
    passwordRequired,
    linkExpiresAt: link.expires_at,
  };
}

/** Returns the project row as stored (sensitive fields stripped by the caller). */
export function stripProjectForClient(project: ProjectRow) {
  const {
    owner_capability_hash: _owner_capability_hash,
    password_hash: _password_hash,
    ...safe
  } = project;
  return safe;
}

/** Issues a short-lived playback URL for the authorized asset role. */
export async function issuePlaybackUrl(
  env: Env,
  token: string,
  grantCookie: string | null,
  role: AssetRole,
  origin: string,
): Promise<PlaybackUrlResult> {
  // Re-run the complete authorization check on every playback request.
  const access = await resolveShareAccess(env, token, grantCookie);

  const asset = await env.DB.prepare(
    `SELECT object_key, mime_type, size_bytes, filename FROM audio_assets
     WHERE project_id = ? AND role = ?`,
  )
    .bind(access.project.id, role)
    .first<{
      object_key: string;
      mime_type: string;
      size_bytes: number;
      filename: string;
    }>();

  if (!asset) {
    throw shareError('Asset not ready', 'PROJECT_NOT_READY', 409);
  }

  const playbackUrl = await createSharePresignedGetUrl(
    env,
    origin,
    asset.object_key,
    QUOTA_POLICY.sharePlaybackUrlTtlSeconds,
  );

  return {
    url: playbackUrl,
    expiresAt: Date.now() + QUOTA_POLICY.sharePlaybackUrlTtlSeconds * 1000,
    mimeType: asset.mime_type,
    sizeBytes: asset.size_bytes,
  };
}

/** Creates a short-lived presigned GET URL for a share playback asset. */
export async function createSharePresignedGetUrl(
  env: Env,
  origin: string,
  objectKey: string,
  ttlSeconds: number,
): Promise<string> {
  const { createPresignedGetUrl } = await import('./r2');
  try {
    return await createPresignedGetUrl(env, origin, objectKey, ttlSeconds);
  } catch {
    throw shareError('Private audio storage is not configured', 'STORAGE_UNAVAILABLE', 503);
  }
}

/* ------------------------------------------------------------------ */
/* Password protection                                                */
/* ------------------------------------------------------------------ */

const PASSWORD_GRANT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const PASSWORD_MAX_ATTEMPTS = 5;
const PASSWORD_LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes
const PASSWORD_PBKDF2_ITERATIONS = 210_000;

const GRANT_COOKIE_NAME = 'sw_share_grant';

function grantCookieName(linkId: string): string {
  return `${GRANT_COOKIE_NAME}_${linkId}`;
}

/** Derives an adaptive password hash (PBKDF2-HMAC-SHA256) with a random salt. */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_PBKDF2_ITERATIONS },
    keyMaterial,
    256,
  );
  const hashArray = Array.from(new Uint8Array(bits));
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `pbkdf2_sha256$${PASSWORD_PBKDF2_ITERATIONS}$${saltHex}$${hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Verifies a password against a stored adaptive hash. Returns false on mismatch. */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expected = parts[3];
  if (!iterations || !salt || !expected) return false;

  const encoder = new TextEncoder();
  const saltBytes = hexToBytes(salt);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes as unknown as BufferSource, iterations },
    keyMaterial,
    256,
  );
  const actual = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return constantTimeEqualsString(actual, expected);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeEqualsString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Throttles password attempts for a (project, link) scoped attempt key. */
export async function checkPasswordThrottle(
  db: D1Database,
  projectId: string,
  attemptKeyHash: string,
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  const now = Date.now();
  const row = await db
    .prepare('SELECT * FROM password_attempts WHERE project_id = ? AND attempt_key_hash = ?')
    .bind(projectId, attemptKeyHash)
    .first<{
      id: string;
      attempts: number;
      locked_until_at: number | null;
      first_attempt_at: number;
      updated_at: number;
    }>();

  if (row) {
    if (row.locked_until_at !== null && now < row.locked_until_at) {
      return { allowed: false, retryAfterMs: row.locked_until_at - now };
    }
    if (row.attempts >= PASSWORD_MAX_ATTEMPTS) {
      const lockout = new Date(row.first_attempt_at).getTime() + PASSWORD_LOCKOUT_MS;
      await db
        .prepare('UPDATE password_attempts SET locked_until_at = ?, updated_at = ? WHERE id = ?')
        .bind(lockout, now, row.id)
        .run();
      return { allowed: false, retryAfterMs: Math.max(lockout - now, 0) };
    }
  }
  return { allowed: true };
}

export async function recordPasswordAttempt(
  db: D1Database,
  projectId: string,
  attemptKeyHash: string,
  success: boolean,
): Promise<void> {
  const now = Date.now();
  const row = await db
    .prepare('SELECT * FROM password_attempts WHERE project_id = ? AND attempt_key_hash = ?')
    .bind(projectId, attemptKeyHash)
    .first<{ id: string; attempts: number; first_attempt_at: number }>();

  if (!row) {
    await db
      .prepare(
        `INSERT INTO password_attempts (id, project_id, attempt_key_hash, attempts, first_attempt_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
      )
      .bind(`attempt_${crypto.randomUUID().replace(/-/g, '')}`, projectId, attemptKeyHash, now, now)
      .run();
    return;
  }

  if (success) {
    // Clear the counter on success.
    await db
      .prepare(
        'UPDATE password_attempts SET attempts = 0, locked_until_at = NULL, updated_at = ? WHERE id = ?',
      )
      .bind(now, row.id)
      .run();
    return;
  }

  const attempts = row.attempts + 1;
  await db
    .prepare('UPDATE password_attempts SET attempts = ?, updated_at = ? WHERE id = ?')
    .bind(attempts, now, row.id)
    .run();
}

/** Verifies a link-scoped password grant cookie. Returns true if valid. */
export async function verifyPasswordGrant(
  env: Env,
  linkId: string,
  projectId: string,
  grantCookie: string | null,
): Promise<boolean> {
  if (!grantCookie) return false;
  const grantHash = await hashToken(grantCookie);
  const row = await env.DB.prepare(
    'SELECT * FROM share_password_grants WHERE grant_hash = ? AND link_id = ? AND project_id = ?',
  )
    .bind(grantHash, linkId, projectId)
    .first<{ expires_at: number }>();
  if (!row) return false;
  return Date.now() < row.expires_at;
}

/** Issues a new password grant and returns the raw grant token + Set-Cookie header value. */
export async function issuePasswordGrant(
  db: D1Database,
  projectId: string,
  linkId: string,
): Promise<{ grantToken: string; cookieValue: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const grantToken = `gnt_${encodeBase64Url(bytes)}`;
  const grantHash = await hashToken(grantToken);
  const now = Date.now();
  const expiresAt = now + PASSWORD_GRANT_TTL_MS;
  const grantId = `grant_${crypto.randomUUID().replace(/-/g, '')}`;

  await db
    .prepare(
      `INSERT INTO share_password_grants (id, project_id, link_id, grant_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(grantId, projectId, linkId, grantHash, expiresAt, now)
    .run();

  const isSecure = true; // grants are only meaningful over HTTPS; cookie marked Secure
  const secureFlag = isSecure ? '; Secure' : '';
  const maxAge = Math.floor(PASSWORD_GRANT_TTL_MS / 1000);
  const cookieValue = `${grantCookieName(linkId)}=${encodeURIComponent(grantToken)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secureFlag}`;

  return { grantToken, cookieValue };
}

/** Clears a password grant cookie for a link. */
export function clearPasswordGrantCookie(linkId: string): string {
  return `${grantCookieName(linkId)}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`;
}

/** Derives a bounded attempt key from a visitor identifier (e.g. hashed IP). */
export function hashAttemptKey(input: string): Promise<string> {
  return hashToken(input);
}

/** Returns whether password protection is enabled at runtime. */
export function isPasswordProtectionEnabled(env: Env): boolean {
  return String(env.SHARING_PASSWORD_PROTECTION_ENABLED).toLowerCase() === 'true';
}
