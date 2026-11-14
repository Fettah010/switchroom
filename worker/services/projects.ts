// Project management, lifecycle, and storage operations for Switchroom v0.5.0

import type { AudioAssetRow, Env, ProjectRow, ProjectStatus, RetentionDays } from '../types';
import {
  computeExpiryTimestamp,
  DEFAULT_RETENTION_DAYS,
  isValidRetention,
  QUOTA_POLICY,
} from '../config/quotas';
import { generateGuestOwnerCapability, generateOpaqueId, hashCapability } from './crypto';
import { deleteObject } from './r2';

export interface CreateProjectParams {
  title: string;
  description?: string;
  retentionDays?: RetentionDays;
  crossfadeMs?: number;
  presentationLayout?: string;
  ownerUserId?: string | null;
}

export interface CreateProjectResult {
  project: ProjectRow;
  guestCapability?: string;
  recoveryUrl?: string;
}

/** Fetches a project by its unique ID. */
export async function getProjectById(db: D1Database, id: string): Promise<ProjectRow | null> {
  try {
    const stmt = db.prepare('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL');
    const row = await stmt.bind(id).first<ProjectRow>();
    return row || null;
  } catch {
    return null;
  }
}

/** Lists active projects owned by a signed-in user. */
export async function listProjectsForUser(db: D1Database, userId: string): Promise<ProjectRow[]> {
  try {
    const stmt = db.prepare(
      'SELECT * FROM projects WHERE owner_user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC',
    );
    const result = await stmt.bind(userId).all<ProjectRow>();
    return result.results || [];
  } catch {
    return [];
  }
}

/** Lists projects matching an array of IDs (used for guest local browser dashboard). */
export async function listProjectsByIds(db: D1Database, ids: string[]): Promise<ProjectRow[]> {
  if (ids.length === 0) return [];
  try {
    // Limit max batch query size to 50
    const sliced = ids.slice(0, 50);
    const placeholders = sliced.map(() => '?').join(',');
    const stmt = db.prepare(
      `SELECT * FROM projects WHERE id IN (${placeholders}) AND deleted_at IS NULL ORDER BY updated_at DESC`,
    );
    const result = await stmt.bind(...sliced).all<ProjectRow>();
    return result.results || [];
  } catch {
    return [];
  }
}

/** Creates a new cloud project, enforcing ownership invariants, retention, and quotas. */
export async function createProject(
  db: D1Database,
  origin: string,
  params: CreateProjectParams,
): Promise<CreateProjectResult> {
  const title = (params.title || '').trim().slice(0, 120);
  if (!title) {
    throw new Error('Project title is required and cannot be empty');
  }

  const retention =
    params.retentionDays && isValidRetention(params.retentionDays)
      ? params.retentionDays
      : DEFAULT_RETENTION_DAYS;

  const now = Date.now();
  const expiresAt = computeExpiryTimestamp(now, retention);
  const projectId = generateOpaqueId('proj');

  // Quota enforcement
  if (params.ownerUserId) {
    const existingCount = await db
      .prepare(
        'SELECT COUNT(*) as count FROM projects WHERE owner_user_id = ? AND deleted_at IS NULL',
      )
      .bind(params.ownerUserId)
      .first<{ count: number }>();
    if (existingCount && existingCount.count >= QUOTA_POLICY.signedInMaxProjects) {
      throw new Error(
        `Project quota exceeded. Maximum ${QUOTA_POLICY.signedInMaxProjects} active projects allowed.`,
      );
    }
  }

  let guestCapability: string | undefined;
  let ownerCapabilityHash: string | null = null;
  let recoveryUrl: string | undefined;

  if (!params.ownerUserId) {
    // Generate guest capability
    guestCapability = generateGuestOwnerCapability();
    ownerCapabilityHash = await hashCapability(guestCapability);
    // Use URL fragment so secret is never sent in HTTP request line or Referer headers
    recoveryUrl = `${origin}/#owner=${encodeURIComponent(guestCapability)}&project=${encodeURIComponent(projectId)}`;
  }

  const crossfadeMs = Math.min(Math.max(params.crossfadeMs ?? 180, 80), 600);
  const layout = params.presentationLayout || 'standard';

  await db
    .prepare(
      `INSERT INTO projects (
        id, owner_user_id, owner_capability_hash, title, description,
        status, visibility, retention_days, crossfade_ms, presentation_layout,
        created_at, updated_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      projectId,
      params.ownerUserId || null,
      ownerCapabilityHash,
      title,
      (params.description || '').slice(0, 2000),
      'draft',
      'private',
      retention,
      crossfadeMs,
      layout,
      now,
      now,
      expiresAt,
    )
    .run();

  const project: ProjectRow = {
    id: projectId,
    owner_user_id: params.ownerUserId || null,
    owner_capability_hash: ownerCapabilityHash,
    title,
    description: (params.description || '').slice(0, 2000),
    status: 'draft',
    visibility: 'private',
    retention_days: retention,
    crossfade_ms: crossfadeMs,
    presentation_layout: layout,
    created_at: now,
    updated_at: now,
    expires_at: expiresAt,
    deleted_at: null,
  };

  return {
    project,
    guestCapability,
    recoveryUrl,
  };
}

/** Updates metadata for an owned project. */
export async function updateProject(
  db: D1Database,
  id: string,
  updates: {
    title?: string;
    description?: string;
    retentionDays?: RetentionDays;
    crossfadeMs?: number;
    presentationLayout?: string;
  },
): Promise<ProjectRow> {
  const project = await getProjectById(db, id);
  if (!project) {
    throw new Error('Project not found');
  }

  const now = Date.now();
  let title = project.title;
  let description = project.description;
  let retention = project.retention_days;
  let expiresAt = project.expires_at;
  let crossfadeMs = project.crossfade_ms;
  let layout = project.presentation_layout;

  if (updates.title !== undefined) {
    const clean = updates.title.trim().slice(0, 120);
    if (!clean) throw new Error('Title cannot be empty');
    title = clean;
  }

  if (updates.description !== undefined) {
    description = updates.description.slice(0, 2000);
  }

  if (updates.retentionDays !== undefined && isValidRetention(updates.retentionDays)) {
    retention = updates.retentionDays;
    expiresAt = computeExpiryTimestamp(project.created_at, retention);
  }

  if (updates.crossfadeMs !== undefined) {
    crossfadeMs = Math.min(Math.max(updates.crossfadeMs, 80), 600);
  }

  if (updates.presentationLayout !== undefined) {
    layout = updates.presentationLayout;
  }

  await db
    .prepare(
      `UPDATE projects SET
        title = ?, description = ?, retention_days = ?, expires_at = ?,
        crossfade_ms = ?, presentation_layout = ?, updated_at = ?
      WHERE id = ?`,
    )
    .bind(title, description, retention, expiresAt, crossfadeMs, layout, now, id)
    .run();

  return {
    ...project,
    title,
    description,
    retention_days: retention,
    expires_at: expiresAt,
    crossfade_ms: crossfadeMs,
    presentation_layout: layout,
    updated_at: now,
  };
}

/** Fetches assets associated with a project. */
export async function getProjectAssets(
  db: D1Database,
  projectId: string,
): Promise<{ original: AudioAssetRow | null; edited: AudioAssetRow | null }> {
  try {
    const stmt = db.prepare('SELECT * FROM audio_assets WHERE project_id = ?');
    const rows = (await stmt.bind(projectId).all<AudioAssetRow>()).results || [];

    return {
      original: rows.find((r) => r.role === 'original') || null,
      edited: rows.find((r) => r.role === 'edited') || null,
    };
  } catch {
    return { original: null, edited: null };
  }
}

/** Recalculates and updates project status based on assets and expiry. */
export async function reconcileProjectStatus(
  db: D1Database,
  projectId: string,
): Promise<ProjectStatus> {
  const project = await getProjectById(db, projectId);
  if (!project) return 'draft';

  const now = Date.now();
  if (now >= project.expires_at) {
    if (project.status !== 'expired') {
      await db
        .prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?')
        .bind('expired', now, projectId)
        .run();
    }
    return 'expired';
  }

  const assets = await getProjectAssets(db, projectId);
  let nextStatus: ProjectStatus = 'draft';

  if (assets.original?.status === 'ready' && assets.edited?.status === 'ready') {
    nextStatus = 'ready';
  } else if (assets.original?.status === 'uploading' || assets.edited?.status === 'uploading') {
    nextStatus = 'uploading';
  }

  if (project.status !== nextStatus && project.status !== 'deleting') {
    await db
      .prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?')
      .bind(nextStatus, now, projectId)
      .run();
  }

  return nextStatus;
}

/**
 * Safely deletes a project and its associated R2 audio objects.
 * Handles partial failures idempotently.
 */
export async function deleteProject(env: Env, projectId: string): Promise<void> {
  const db = env.DB;
  const project = await getProjectById(db, projectId);
  if (!project) return;

  // 1. Mark as deleting to prevent new uploads or playback
  await db
    .prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?')
    .bind('deleting', Date.now(), projectId)
    .run();

  // 2. Collect all R2 object keys
  const assetKeysResult = await db
    .prepare('SELECT object_key FROM audio_assets WHERE project_id = ?')
    .bind(projectId)
    .all<{ object_key: string }>();

  const sessionKeysResult = await db
    .prepare('SELECT object_key FROM upload_sessions WHERE project_id = ?')
    .bind(projectId)
    .all<{ object_key: string }>();

  const allKeys = new Set<string>();
  for (const r of assetKeysResult.results || []) {
    if (r.object_key) allKeys.add(r.object_key);
  }
  for (const r of sessionKeysResult.results || []) {
    if (r.object_key) allKeys.add(r.object_key);
  }

  // 3. Delete R2 objects
  for (const key of allKeys) {
    await deleteObject(env, key);
  }

  // 4. Delete D1 rows in safe relational order
  await db.batch([
    db.prepare('DELETE FROM upload_sessions WHERE project_id = ?').bind(projectId),
    db.prepare('DELETE FROM audio_assets WHERE project_id = ?').bind(projectId),
    db.prepare('DELETE FROM projects WHERE id = ?').bind(projectId),
  ]);
}
