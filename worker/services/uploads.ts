// Upload session management and R2 verification service for Switchroom v0.5.0

import type { Env, AssetRole, AudioAssetRow, UploadSessionRow, ProjectStatus } from '../types';
import { QUOTA_POLICY, isAllowedMimeType } from '../config/quotas';
import { generateOpaqueId, sanitizeFilename } from './crypto';
import { generateObjectKey, createPresignedPutUrl, verifyObjectHead, deleteObject } from './r2';
import { getProjectById, reconcileProjectStatus } from './projects';

export interface CreateUploadSessionParams {
  projectId: string;
  role: AssetRole;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  durationMs?: number | null;
  origin: string;
}

export interface CreateUploadSessionResult {
  uploadSessionId: string;
  uploadUrl: string;
  objectKey: string;
  role: AssetRole;
  expiresAt: number;
}

export class UploadError extends Error {
  constructor(
    public code:
      | 'NOT_FOUND'
      | 'INVALID_INPUT'
      | 'FILE_TOO_LARGE'
      | 'UNSUPPORTED_MEDIA'
      | 'UPLOAD_SESSION_EXPIRED'
      | 'UPLOAD_VERIFICATION_FAILED'
      | 'STORAGE_UNAVAILABLE'
      | 'CONFLICT',
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

/**
 * Creates an upload session and generates a presigned PUT URL.
 */
export async function createUploadSession(
  env: Env,
  params: CreateUploadSessionParams,
): Promise<CreateUploadSessionResult> {
  const { projectId, role, filename, sizeBytes, mimeType, durationMs, origin } = params;

  // 1. Verify project exists and is active
  const project = await getProjectById(env.DB, projectId);
  if (!project) {
    throw new UploadError('NOT_FOUND', `Project ${projectId} not found`);
  }

  const now = Date.now();
  if (project.expires_at <= now) {
    throw new UploadError('CONFLICT', `Project ${projectId} has expired`);
  }

  // 2. Validate role
  if (role !== 'original' && role !== 'edited') {
    throw new UploadError('INVALID_INPUT', `Invalid asset role: ${role}`);
  }

  // 3. Validate file size (100 MB limit)
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new UploadError('INVALID_INPUT', 'Invalid file size');
  }
  if (sizeBytes > QUOTA_POLICY.maxFileSizeBytes) {
    throw new UploadError(
      'FILE_TOO_LARGE',
      `File size (${Math.round(sizeBytes / (1024 * 1024))} MB) exceeds maximum allowed size (${QUOTA_POLICY.maxFileSizeBytes / (1024 * 1024)} MB)`,
    );
  }

  // 4. Validate MIME type
  const cleanMime = (mimeType || 'audio/wav').toLowerCase().trim();
  if (!isAllowedMimeType(cleanMime)) {
    throw new UploadError('UNSUPPORTED_MEDIA', `Unsupported audio format: ${cleanMime}`);
  }

  // 5. Generate secure object key and upload session ID
  const objectKey = generateObjectKey(projectId, role);
  const uploadSessionId = generateOpaqueId('upsess');
  const safeFilename = sanitizeFilename(filename || `${role}.wav`);
  const expiresAt = now + QUOTA_POLICY.uploadUrlTtlSeconds * 1000;

  // 6. Generate presigned PUT URL
  const uploadUrl = await createPresignedPutUrl(
    env,
    origin,
    objectKey,
    cleanMime,
    QUOTA_POLICY.uploadUrlTtlSeconds,
  );

  // 7. Insert upload session record
  await env.DB.prepare(
    `INSERT INTO upload_sessions (id, project_id, role, object_key, expected_size, expected_mime, status, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?, ?)`,
  )
    .bind(uploadSessionId, projectId, role, objectKey, sizeBytes, cleanMime, expiresAt, now, now)
    .run();

  // 8. Upsert audio_assets record as 'uploading'
  const assetId = generateOpaqueId('asset');
  await env.DB.prepare(
    `INSERT INTO audio_assets (id, project_id, role, object_key, filename, mime_type, size_bytes, duration_ms, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?, ?)
     ON CONFLICT(project_id, role) DO UPDATE SET
       object_key = excluded.object_key,
       filename = excluded.filename,
       mime_type = excluded.mime_type,
       size_bytes = excluded.size_bytes,
       duration_ms = excluded.duration_ms,
       status = 'uploading',
       updated_at = excluded.updated_at`,
  )
    .bind(
      assetId,
      projectId,
      role,
      objectKey,
      safeFilename,
      cleanMime,
      sizeBytes,
      durationMs || null,
      now,
      now,
    )
    .run();

  // 9. Update project status to 'uploading' if it's currently 'draft'
  if (project.status === 'draft') {
    await env.DB.prepare(`UPDATE projects SET status = 'uploading', updated_at = ? WHERE id = ?`)
      .bind(now, projectId)
      .run();
  }

  return {
    uploadSessionId,
    uploadUrl,
    objectKey,
    role,
    expiresAt,
  };
}

export interface CompleteUploadSessionResult {
  success: boolean;
  asset: AudioAssetRow;
  projectStatus: ProjectStatus;
}

/**
 * Completes an upload session by verifying object in R2 and updating database records.
 */
export async function completeUploadSession(
  env: Env,
  uploadSessionId: string,
): Promise<CompleteUploadSessionResult> {
  const now = Date.now();

  // 1. Fetch upload session
  const session = await env.DB.prepare(`SELECT * FROM upload_sessions WHERE id = ?`)
    .bind(uploadSessionId)
    .first<UploadSessionRow>();

  if (!session) {
    throw new UploadError('NOT_FOUND', `Upload session ${uploadSessionId} not found`);
  }

  if (session.status === 'completed') {
    // Already completed, fetch current asset
    const currentAsset = await env.DB.prepare(
      `SELECT * FROM audio_assets WHERE project_id = ? AND role = ?`,
    )
      .bind(session.project_id, session.role)
      .first<AudioAssetRow>();

    const project = await getProjectById(env.DB, session.project_id);
    if (currentAsset && project) {
      return {
        success: true,
        asset: currentAsset,
        projectStatus: project.status,
      };
    }
  }

  if (session.status !== 'created') {
    throw new UploadError('CONFLICT', `Upload session is already in status '${session.status}'`);
  }

  if (session.expires_at <= now) {
    await env.DB.prepare(
      `UPDATE upload_sessions SET status = 'expired', updated_at = ? WHERE id = ?`,
    )
      .bind(now, uploadSessionId)
      .run();
    throw new UploadError('UPLOAD_SESSION_EXPIRED', 'Upload session has expired');
  }

  // 2. Query previous asset object key to clean up if we are overwriting
  const existingAsset = await env.DB.prepare(
    `SELECT * FROM audio_assets WHERE project_id = ? AND role = ?`,
  )
    .bind(session.project_id, session.role)
    .first<AudioAssetRow>();

  const previousObjectKey =
    existingAsset && existingAsset.object_key !== session.object_key
      ? existingAsset.object_key
      : null;

  // 3. Verify R2 object via HEAD request
  let headResult;
  try {
    headResult = await verifyObjectHead(env, session.object_key);
  } catch (err) {
    throw new UploadError(
      'STORAGE_UNAVAILABLE',
      'Failed to inspect storage bucket for uploaded file',
      err,
    );
  }

  if (!headResult.exists) {
    await env.DB.prepare(
      `UPDATE upload_sessions SET status = 'failed', updated_at = ? WHERE id = ?`,
    )
      .bind(now, uploadSessionId)
      .run();
    await env.DB.prepare(
      `UPDATE audio_assets SET status = 'failed', updated_at = ? WHERE project_id = ? AND role = ?`,
    )
      .bind(now, session.project_id, session.role)
      .run();
    throw new UploadError(
      'UPLOAD_VERIFICATION_FAILED',
      'Uploaded file was not found in storage. Ensure browser upload finished before completion.',
    );
  }

  // Size verification: must match expected size within reasonable tolerance (or exact)
  if (headResult.sizeBytes <= 0 || headResult.sizeBytes > QUOTA_POLICY.maxFileSizeBytes) {
    await deleteObject(env, session.object_key);
    await env.DB.prepare(
      `UPDATE upload_sessions SET status = 'failed', updated_at = ? WHERE id = ?`,
    )
      .bind(now, uploadSessionId)
      .run();
    await env.DB.prepare(
      `UPDATE audio_assets SET status = 'failed', updated_at = ? WHERE project_id = ? AND role = ?`,
    )
      .bind(now, session.project_id, session.role)
      .run();
    throw new UploadError(
      'UPLOAD_VERIFICATION_FAILED',
      `File size verification failed (stored: ${headResult.sizeBytes} bytes, expected: ${session.expected_size} bytes)`,
    );
  }

  // 4. Update audio_assets record to 'ready'
  await env.DB.prepare(
    `UPDATE audio_assets SET
       status = 'ready',
       size_bytes = ?,
       object_key = ?,
       updated_at = ?
     WHERE project_id = ? AND role = ?`,
  )
    .bind(headResult.sizeBytes, session.object_key, now, session.project_id, session.role)
    .run();

  // 5. Update upload session to 'completed'
  await env.DB.prepare(
    `UPDATE upload_sessions SET status = 'completed', updated_at = ? WHERE id = ?`,
  )
    .bind(now, uploadSessionId)
    .run();

  // 6. Delete old object if replacing
  if (previousObjectKey) {
    await deleteObject(env, previousObjectKey);
  }

  // 7. Reconcile project status
  const projectStatus = await reconcileProjectStatus(env.DB, session.project_id);

  // 8. Fetch updated asset row
  const updatedAsset = await env.DB.prepare(
    `SELECT * FROM audio_assets WHERE project_id = ? AND role = ?`,
  )
    .bind(session.project_id, session.role)
    .first<AudioAssetRow>();

  if (!updatedAsset) {
    throw new UploadError('NOT_FOUND', 'Asset not found after update');
  }

  return {
    success: true,
    asset: updatedAsset,
    projectStatus,
  };
}

/**
 * Cancels an upload session and cleans up unverified R2 object.
 */
export async function cancelUploadSession(
  env: Env,
  uploadSessionId: string,
): Promise<{ success: boolean }> {
  const now = Date.now();

  const session = await env.DB.prepare(`SELECT * FROM upload_sessions WHERE id = ?`)
    .bind(uploadSessionId)
    .first<UploadSessionRow>();

  if (!session) {
    return { success: true };
  }

  if (session.status === 'completed') {
    throw new UploadError('CONFLICT', 'Cannot cancel an already completed upload session');
  }

  // Delete uploaded object if any was written
  await deleteObject(env, session.object_key);

  // Mark session cancelled
  await env.DB.prepare(
    `UPDATE upload_sessions SET status = 'cancelled', updated_at = ? WHERE id = ?`,
  )
    .bind(now, uploadSessionId)
    .run();

  // If asset is still in 'uploading' state with this object key, reset it or remove it
  const asset = await env.DB.prepare(`SELECT * FROM audio_assets WHERE project_id = ? AND role = ?`)
    .bind(session.project_id, session.role)
    .first<AudioAssetRow>();

  if (asset && asset.object_key === session.object_key && asset.status === 'uploading') {
    await env.DB.prepare(`DELETE FROM audio_assets WHERE id = ?`).bind(asset.id).run();
  }

  await reconcileProjectStatus(env.DB, session.project_id);

  return { success: true };
}
