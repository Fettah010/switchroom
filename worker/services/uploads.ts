// Upload session management and R2 verification service for Switchroom v0.7.0

import type {
  Env,
  AssetRole,
  AudioAssetRow,
  UploadSessionRow,
  ProjectStatus,
  UploadStrategy,
} from '../types';
import {
  QUOTA_POLICY,
  isAllowedMimeType,
  calculatePartSize,
  selectUploadStrategy,
} from '../config/quotas';
import { generateOpaqueId, sanitizeFilename } from './crypto';
import {
  generateObjectKey,
  createPresignedPutUrl,
  createR2MultipartUpload,
  createPresignedPartUrl,
  completeR2MultipartUpload,
  abortR2MultipartUpload,
  verifyObjectHead,
  deleteObject,
  type MultipartPartInput,
} from './r2';
import { getProjectById, reconcileProjectStatus } from './projects';
import { assertStorageQuotaAvailable, releaseStorageReservation } from './storageQuota';

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
  strategy: UploadStrategy;
  multipartUploadId?: string;
  uploadUrl?: string;
  partSize?: number;
  totalParts?: number;
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
      | 'STORAGE_BUDGET_EXCEEDED'
      | 'QUOTA_EXCEEDED'
      | 'INVALID_PART'
      | 'CONFLICT',
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

/**
 * Creates an upload session (single-PUT or multipart) and reserves storage quota.
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

  // 3. Validate file size and provider technical limit
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new UploadError('INVALID_INPUT', 'Invalid file size: must be greater than zero');
  }
  if (sizeBytes > QUOTA_POLICY.multipartMaxBytes) {
    throw new UploadError(
      'FILE_TOO_LARGE',
      `File size exceeds technical maximum supported size (${QUOTA_POLICY.multipartMaxBytes / (1024 * 1024 * 1024 * 1024)} TB)`,
    );
  }

  // 4. Assert storage budget and quota availability (accounts for committed + in-flight)
  await assertStorageQuotaAvailable(env.DB, project, sizeBytes, now);

  // 5. Validate MIME type
  const cleanMime = (mimeType || 'audio/wav').toLowerCase().trim();
  if (!isAllowedMimeType(cleanMime)) {
    throw new UploadError('UNSUPPORTED_MEDIA', `Unsupported audio format: ${cleanMime}`);
  }

  // 6. Generate secure object key and upload session ID
  const objectKey = generateObjectKey(projectId, role);
  const uploadSessionId = generateOpaqueId('upsess');
  const safeFilename = sanitizeFilename(filename || `${role}.wav`);
  const expiresAt = now + QUOTA_POLICY.uploadUrlTtlSeconds * 1000;

  // 7. Determine strategy
  const strategy = selectUploadStrategy(sizeBytes);

  let uploadUrl: string | undefined;
  let partSize: number | undefined;
  let totalParts: number | undefined;
  let multipartUploadId: string | null = null;

  if (strategy === 'single_put') {
    try {
      uploadUrl = await createPresignedPutUrl(
        env,
        origin,
        objectKey,
        cleanMime,
        QUOTA_POLICY.uploadUrlTtlSeconds,
      );
    } catch {
      throw new UploadError('STORAGE_UNAVAILABLE', 'Private audio storage is not configured');
    }
  } else {
    // Multipart upload
    const calc = calculatePartSize(sizeBytes);
    partSize = calc.partSize;
    totalParts = calc.totalParts;

    try {
      multipartUploadId = await createR2MultipartUpload(env, objectKey, cleanMime);
    } catch (err) {
      throw new UploadError(
        'STORAGE_UNAVAILABLE',
        `Failed to initialize multipart upload: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 8. Insert upload session record with reserved bytes
  await env.DB.prepare(
    `INSERT INTO upload_sessions (
       id, project_id, role, object_key, expected_size, expected_mime,
       status, strategy, multipart_upload_id, part_size, total_parts,
       reserved_bytes, expires_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      uploadSessionId,
      projectId,
      role,
      objectKey,
      sizeBytes,
      cleanMime,
      strategy,
      multipartUploadId,
      partSize ?? null,
      totalParts ?? null,
      sizeBytes, // in-flight reservation
      expiresAt,
      now,
      now,
    )
    .run();

  // 9. Upsert audio_assets record as 'uploading'
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

  // 10. Update project status to 'uploading' if it's currently 'draft'
  if (project.status === 'draft') {
    await env.DB.prepare(`UPDATE projects SET status = 'uploading', updated_at = ? WHERE id = ?`)
      .bind(now, projectId)
      .run();
  }

  return {
    uploadSessionId,
    strategy,
    multipartUploadId: multipartUploadId ?? undefined,
    uploadUrl,
    partSize,
    totalParts,
    objectKey,
    role,
    expiresAt,
  };
}

/**
 * Generates a presigned part upload URL for a specific part number in a multipart session.
 */
export async function getMultipartPartUrl(
  env: Env,
  uploadSessionId: string,
  partNumber: number,
  origin: string,
): Promise<{ partNumber: number; uploadUrl: string; expiresAt: number }> {
  const now = Date.now();
  const session = await env.DB.prepare(`SELECT * FROM upload_sessions WHERE id = ?`)
    .bind(uploadSessionId)
    .first<UploadSessionRow>();

  if (!session) {
    throw new UploadError('NOT_FOUND', `Upload session ${uploadSessionId} not found`);
  }
  if (session.status !== 'created') {
    throw new UploadError('CONFLICT', `Upload session is in status '${session.status}'`);
  }
  if (session.expires_at <= now) {
    throw new UploadError('UPLOAD_SESSION_EXPIRED', 'Upload session has expired');
  }
  if (session.strategy !== 'multipart' || !session.multipart_upload_id) {
    throw new UploadError('INVALID_INPUT', 'Upload session is not a multipart upload');
  }
  if (
    !Number.isInteger(partNumber) ||
    partNumber < 1 ||
    (session.total_parts && partNumber > session.total_parts)
  ) {
    throw new UploadError(
      'INVALID_PART',
      `Invalid part number: ${partNumber}. Must be between 1 and ${session.total_parts}`,
    );
  }

  const uploadUrl = await createPresignedPartUrl(
    env,
    origin,
    session.id,
    session.object_key,
    session.multipart_upload_id,
    partNumber,
    QUOTA_POLICY.uploadUrlTtlSeconds,
  );

  return {
    partNumber,
    uploadUrl,
    expiresAt: now + QUOTA_POLICY.uploadUrlTtlSeconds * 1000,
  };
}

/**
 * Records a verified completed part in D1 for resumption and completion validation.
 */
export async function recordCompletedPart(
  env: Env,
  uploadSessionId: string,
  partNumber: number,
  etag: string,
  sizeBytes: number,
): Promise<void> {
  const now = Date.now();
  const session = await env.DB.prepare(`SELECT * FROM upload_sessions WHERE id = ?`)
    .bind(uploadSessionId)
    .first<UploadSessionRow>();

  if (!session) {
    throw new UploadError('NOT_FOUND', `Upload session ${uploadSessionId} not found`);
  }
  if (session.status !== 'created') {
    throw new UploadError('CONFLICT', `Upload session is in status '${session.status}'`);
  }
  if (
    !Number.isInteger(partNumber) ||
    partNumber < 1 ||
    (session.total_parts && partNumber > session.total_parts)
  ) {
    throw new UploadError('INVALID_PART', `Invalid part number: ${partNumber}`);
  }
  if (!etag || typeof etag !== 'string') {
    throw new UploadError('INVALID_PART', 'Part ETag is required');
  }

  const cleanEtag = etag.trim();
  const partId = generateOpaqueId('part');

  await env.DB.prepare(
    `INSERT INTO upload_parts (id, upload_session_id, part_number, etag, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(upload_session_id, part_number) DO UPDATE SET
       etag = excluded.etag,
       size_bytes = excluded.size_bytes`,
  )
    .bind(partId, uploadSessionId, partNumber, cleanEtag, sizeBytes, now)
    .run();
}

/**
 * Returns the list of completed parts for an upload session (for safe resumption).
 */
export async function listCompletedParts(
  env: Env,
  uploadSessionId: string,
): Promise<{ parts: { partNumber: number; etag: string; sizeBytes: number }[] }> {
  const session = await env.DB.prepare(`SELECT * FROM upload_sessions WHERE id = ?`)
    .bind(uploadSessionId)
    .first<UploadSessionRow>();

  if (!session) {
    throw new UploadError('NOT_FOUND', `Upload session ${uploadSessionId} not found`);
  }

  const rows = await env.DB.prepare(
    `SELECT part_number, etag, size_bytes FROM upload_parts WHERE upload_session_id = ? ORDER BY part_number ASC`,
  )
    .bind(uploadSessionId)
    .all<{ part_number: number; etag: string; size_bytes: number }>();

  return {
    parts: (rows.results || []).map((r) => ({
      partNumber: r.part_number,
      etag: r.etag,
      sizeBytes: r.size_bytes,
    })),
  };
}

export interface CompleteUploadSessionResult {
  success: boolean;
  asset: AudioAssetRow;
  projectStatus: ProjectStatus;
}

/**
 * Completes an upload session (single-PUT or multipart) by verifying the object in R2,
 * converting reserved bytes to committed usage, and marking the asset ready.
 */
export async function completeUploadSession(
  env: Env,
  uploadSessionId: string,
  proposedParts?: MultipartPartInput[],
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
    // Already completed idempotently, fetch current asset
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
    await releaseStorageReservation(env.DB, uploadSessionId);
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

  // 3. If multipart, complete the multipart upload on R2
  if (session.strategy === 'multipart') {
    if (!session.multipart_upload_id) {
      throw new UploadError('INVALID_INPUT', 'Missing multipart upload identifier');
    }

    // Retrieve or validate parts
    let partsToComplete = proposedParts;
    if (!partsToComplete || partsToComplete.length === 0) {
      const dbParts = await env.DB.prepare(
        `SELECT part_number, etag FROM upload_parts WHERE upload_session_id = ? ORDER BY part_number ASC`,
      )
        .bind(uploadSessionId)
        .all<{ part_number: number; etag: string }>();
      partsToComplete = (dbParts.results || []).map((r) => ({
        partNumber: r.part_number,
        etag: r.etag,
      }));
    }

    if (!partsToComplete || partsToComplete.length !== session.total_parts) {
      throw new UploadError(
        'UPLOAD_VERIFICATION_FAILED',
        `Incomplete parts: expected ${session.total_parts} parts, but received ${partsToComplete?.length ?? 0}`,
      );
    }

    // Verify parts order and part numbers
    for (let i = 0; i < partsToComplete.length; i++) {
      const part = partsToComplete[i]!;
      if (part.partNumber !== i + 1 || !part.etag) {
        throw new UploadError(
          'INVALID_PART',
          `Invalid or out-of-sequence part number: ${part.partNumber}`,
        );
      }
    }

    try {
      await completeR2MultipartUpload(
        env,
        session.object_key,
        session.multipart_upload_id,
        partsToComplete,
      );
    } catch (err) {
      throw new UploadError(
        'UPLOAD_VERIFICATION_FAILED',
        `Failed to complete multipart object in storage: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 4. Verify R2 object via HEAD request
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
    await releaseStorageReservation(env.DB, uploadSessionId);
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

  // Size verification: must be non-empty and truthful
  if (headResult.sizeBytes <= 0) {
    await deleteObject(env, session.object_key);
    await releaseStorageReservation(env.DB, uploadSessionId);
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
    throw new UploadError('UPLOAD_VERIFICATION_FAILED', 'Uploaded file is empty (0 bytes)');
  }

  // 5. Update audio_assets record to 'ready' with actual verified size
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

  // 6. Update upload session to 'completed' and release reserved_bytes to 0
  await env.DB.prepare(
    `UPDATE upload_sessions SET status = 'completed', reserved_bytes = 0, updated_at = ? WHERE id = ?`,
  )
    .bind(now, uploadSessionId)
    .run();

  // 7. Delete old object if replacing
  if (previousObjectKey) {
    await deleteObject(env, previousObjectKey);
  }

  // 8. Reconcile project status
  const projectStatus = await reconcileProjectStatus(env.DB, session.project_id);

  // 9. Fetch updated asset row
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
 * Cancels or aborts an upload session, cleans up unverified R2 objects/parts, and releases reserved storage bytes.
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

  // If multipart, abort the multipart session on R2
  if (session.strategy === 'multipart' && session.multipart_upload_id) {
    await abortR2MultipartUpload(env, session.object_key, session.multipart_upload_id);
  } else {
    // Delete single PUT object if any was written
    await deleteObject(env, session.object_key);
  }

  // Release reservation and mark session cancelled
  await env.DB.prepare(
    `UPDATE upload_sessions SET status = 'cancelled', reserved_bytes = 0, updated_at = ? WHERE id = ?`,
  )
    .bind(now, uploadSessionId)
    .run();

  // Clean up upload_parts
  await env.DB.prepare(`DELETE FROM upload_parts WHERE upload_session_id = ?`)
    .bind(uploadSessionId)
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
