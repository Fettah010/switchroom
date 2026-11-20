// Storage budget and in-flight reservation accounting for Switchroom v0.7.0

import type { ProjectRow } from '../types';
import { QUOTA_POLICY } from '../config/quotas';
import { UploadError } from './uploads';

export interface StorageUsageSummary {
  committedBytes: number;
  reservedBytes: number;
  totalUsageBytes: number;
  limitBytes: number;
  globalCommittedBytes: number;
  globalReservedBytes: number;
  globalTotalBytes: number;
  globalBudgetBytes: number;
}

/**
 * Checks available storage against project, account, and global Switchroom budgets,
 * taking both committed objects and in-flight reservations into account.
 */
export async function assertStorageQuotaAvailable(
  db: D1Database,
  project: ProjectRow,
  requestedSizeBytes: number,
  now = Date.now(),
): Promise<void> {
  // 1. Global aggregate budget check
  const globalRow = await db
    .prepare(
      `SELECT
         (SELECT COALESCE(SUM(size_bytes), 0) FROM audio_assets WHERE status = 'ready') AS committed,
         (SELECT COALESCE(SUM(reserved_bytes), 0) FROM upload_sessions WHERE status = 'created' AND expires_at > ?) AS reserved`,
    )
    .bind(now)
    .first<{ committed: number; reserved: number }>();

  const globalCommitted = Number(globalRow?.committed ?? 0);
  const globalReserved = Number(globalRow?.reserved ?? 0);

  if (
    globalCommitted + globalReserved + requestedSizeBytes >
    QUOTA_POLICY.switchroomAggregateBudgetBytes
  ) {
    throw new UploadError(
      'STORAGE_BUDGET_EXCEEDED',
      'Switchroom audio storage budget has been reached. Please try again later or contact the administrator.',
    );
  }

  // 2. Project or signed-in user quota check
  if (project.owner_user_id) {
    const userRow = await db
      .prepare(
        `SELECT
           (SELECT COALESCE(SUM(a.size_bytes), 0)
            FROM audio_assets a
            JOIN projects p ON a.project_id = p.id
            WHERE p.owner_user_id = ? AND a.status = 'ready' AND p.deleted_at IS NULL) AS committed,
           (SELECT COALESCE(SUM(s.reserved_bytes), 0)
            FROM upload_sessions s
            JOIN projects p ON s.project_id = p.id
            WHERE p.owner_user_id = ? AND s.status = 'created' AND s.expires_at > ? AND p.deleted_at IS NULL) AS reserved`,
      )
      .bind(project.owner_user_id, project.owner_user_id, now)
      .first<{ committed: number; reserved: number }>();

    const userCommitted = Number(userRow?.committed ?? 0);
    const userReserved = Number(userRow?.reserved ?? 0);

    if (userCommitted + userReserved + requestedSizeBytes > QUOTA_POLICY.signedInMaxStorageBytes) {
      throw new UploadError(
        'QUOTA_EXCEEDED',
        `User storage quota exceeded (${Math.round((userCommitted + userReserved) / (1024 * 1024))} MB used of ${QUOTA_POLICY.signedInMaxStorageBytes / (1024 * 1024)} MB limit)`,
      );
    }
  } else {
    // Guest project quota check
    const projectRow = await db
      .prepare(
        `SELECT
           (SELECT COALESCE(SUM(size_bytes), 0)
            FROM audio_assets
            WHERE project_id = ? AND status = 'ready') AS committed,
           (SELECT COALESCE(SUM(reserved_bytes), 0)
            FROM upload_sessions
            WHERE project_id = ? AND status = 'created' AND expires_at > ?) AS reserved`,
      )
      .bind(project.id, project.id, now)
      .first<{ committed: number; reserved: number }>();

    const projCommitted = Number(projectRow?.committed ?? 0);
    const projReserved = Number(projectRow?.reserved ?? 0);

    if (projCommitted + projReserved + requestedSizeBytes > QUOTA_POLICY.guestMaxStorageBytes) {
      throw new UploadError(
        'QUOTA_EXCEEDED',
        `Guest project storage quota exceeded (${Math.round((projCommitted + projReserved) / (1024 * 1024))} MB used of ${QUOTA_POLICY.guestMaxStorageBytes / (1024 * 1024)} MB limit)`,
      );
    }
  }
}

/**
 * Releases reserved storage bytes idempotently on cancel, abort, or failure.
 */
export async function releaseStorageReservation(
  db: D1Database,
  uploadSessionId: string,
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE upload_sessions
       SET reserved_bytes = 0, updated_at = ?
       WHERE id = ? AND reserved_bytes > 0`,
    )
    .bind(now, uploadSessionId)
    .run();
}

/**
 * Returns a complete usage summary for dashboard/creator feedback.
 */
export async function getStorageUsageSummary(
  db: D1Database,
  project: ProjectRow,
  now = Date.now(),
): Promise<StorageUsageSummary> {
  const globalRow = await db
    .prepare(
      `SELECT
         (SELECT COALESCE(SUM(size_bytes), 0) FROM audio_assets WHERE status = 'ready') AS committed,
         (SELECT COALESCE(SUM(reserved_bytes), 0) FROM upload_sessions WHERE status = 'created' AND expires_at > ?) AS reserved`,
    )
    .bind(now)
    .first<{ committed: number; reserved: number }>();

  const globalCommitted = Number(globalRow?.committed ?? 0);
  const globalReserved = Number(globalRow?.reserved ?? 0);

  let committed = 0;
  let reserved = 0;
  let limit = QUOTA_POLICY.guestMaxStorageBytes;

  if (project.owner_user_id) {
    limit = QUOTA_POLICY.signedInMaxStorageBytes;
    const userRow = await db
      .prepare(
        `SELECT
           (SELECT COALESCE(SUM(a.size_bytes), 0)
            FROM audio_assets a
            JOIN projects p ON a.project_id = p.id
            WHERE p.owner_user_id = ? AND a.status = 'ready' AND p.deleted_at IS NULL) AS committed,
           (SELECT COALESCE(SUM(s.reserved_bytes), 0)
            FROM upload_sessions s
            JOIN projects p ON s.project_id = p.id
            WHERE p.owner_user_id = ? AND s.status = 'created' AND s.expires_at > ? AND p.deleted_at IS NULL) AS reserved`,
      )
      .bind(project.owner_user_id, project.owner_user_id, now)
      .first<{ committed: number; reserved: number }>();
    committed = Number(userRow?.committed ?? 0);
    reserved = Number(userRow?.reserved ?? 0);
  } else {
    const projRow = await db
      .prepare(
        `SELECT
           (SELECT COALESCE(SUM(size_bytes), 0)
            FROM audio_assets
            WHERE project_id = ? AND status = 'ready') AS committed,
           (SELECT COALESCE(SUM(reserved_bytes), 0)
            FROM upload_sessions
            WHERE project_id = ? AND status = 'created' AND expires_at > ?) AS reserved`,
      )
      .bind(project.id, project.id, now)
      .first<{ committed: number; reserved: number }>();
    committed = Number(projRow?.committed ?? 0);
    reserved = Number(projRow?.reserved ?? 0);
  }

  return {
    committedBytes: committed,
    reservedBytes: reserved,
    totalUsageBytes: committed + reserved,
    limitBytes: limit,
    globalCommittedBytes: globalCommitted,
    globalReservedBytes: globalReserved,
    globalTotalBytes: globalCommitted + globalReserved,
    globalBudgetBytes: QUOTA_POLICY.switchroomAggregateBudgetBytes,
  };
}
