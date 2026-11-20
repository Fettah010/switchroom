// Centralized quota and lifecycle policies for Switchroom v0.7.0

import type { RetentionDays, UploadStrategy } from '../types';

export interface QuotaPolicy {
  /** Strategy threshold for multipart uploads (50 MB). Files at/above this size use multipart. */
  multipartThresholdBytes: number;
  /** Provider technical maximum for single PUT (5 GB). */
  singlePutMaxBytes: number;
  /** Provider technical maximum for multipart uploads (5 TB). */
  multipartMaxBytes: number;
  /** Minimum multipart part size (5 MB), mandated by R2/S3 except for final part. */
  minPartSizeBytes: number;
  /** Default part size for multipart uploads (8 MB). */
  defaultPartSizeBytes: number;
  /** Maximum number of multipart parts (10,000). */
  maxPartCount: number;
  /** Aggregate storage budget for the entire Switchroom instance (8 GB default to preserve headroom below 10 GB free tier). */
  switchroomAggregateBudgetBytes: number;
  /** Maximum number of active projects per signed-in user. */
  signedInMaxProjects: number;
  /** Maximum aggregate storage bytes per signed-in user (2 GB). */
  signedInMaxStorageBytes: number;
  /** Maximum number of active projects per guest owner. */
  guestMaxProjects: number;
  /** Maximum aggregate storage bytes per guest project (300 MB). */
  guestMaxStorageBytes: number;
  /** Upload presigned URL lifetime in seconds (30 minutes). */
  uploadUrlTtlSeconds: number;
  /** Playback presigned URL lifetime in seconds (1 hour, owner preview). */
  playbackUrlTtlSeconds: number;
  /** Share playback presigned URL lifetime in seconds (5 minutes target). */
  sharePlaybackUrlTtlSeconds: number;
}

export const QUOTA_POLICY: QuotaPolicy = {
  multipartThresholdBytes: 50 * 1024 * 1024, // 50 MB
  singlePutMaxBytes: 5 * 1024 * 1024 * 1024, // 5 GB
  multipartMaxBytes: 5 * 1024 * 1024 * 1024 * 1024, // 5 TB
  minPartSizeBytes: 5 * 1024 * 1024, // 5 MB
  defaultPartSizeBytes: 8 * 1024 * 1024, // 8 MB
  maxPartCount: 10_000,
  switchroomAggregateBudgetBytes: 8 * 1024 * 1024 * 1024, // 8 GB
  signedInMaxProjects: 20,
  signedInMaxStorageBytes: 2 * 1024 * 1024 * 1024, // 2 GB
  guestMaxProjects: 3,
  guestMaxStorageBytes: 300 * 1024 * 1024, // 300 MB
  uploadUrlTtlSeconds: 1800, // 30 minutes
  playbackUrlTtlSeconds: 3600, // 1 hour
  sharePlaybackUrlTtlSeconds: 300, // 5 minutes
};

export const ALLOWED_RETENTION_DAYS: readonly RetentionDays[] = [1, 7, 14, 30, 60, 90];
export const DEFAULT_RETENTION_DAYS: RetentionDays = 30;

export function isValidRetention(days: number): days is RetentionDays {
  return (ALLOWED_RETENTION_DAYS as readonly number[]).includes(days);
}

export function computeExpiryTimestamp(createdAtMs: number, retentionDays: RetentionDays): number {
  return createdAtMs + retentionDays * 24 * 60 * 60 * 1000;
}

export const ALLOWED_AUDIO_MIMES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/flac',
  'audio/x-flac',
  'audio/aac',
  'audio/x-aac',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/ogg',
  'application/octet-stream',
]);

export function isAllowedMimeType(mime: string): boolean {
  const normalized = mime.toLowerCase().trim();
  if (ALLOWED_AUDIO_MIMES.has(normalized)) return true;
  return normalized.startsWith('audio/');
}

/**
 * Calculates a valid part size and total parts count adhering to R2/S3 invariants:
 * - Minimum part size: 5 MB (except final part)
 * - Maximum parts: 10,000
 * - Non-final parts are identical in size
 */
export function calculatePartSize(sizeBytes: number): { partSize: number; totalParts: number } {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new Error('File size must be greater than zero');
  }

  let partSize = QUOTA_POLICY.defaultPartSizeBytes;

  // Scale up if total parts would exceed 10,000
  if (Math.ceil(sizeBytes / partSize) > QUOTA_POLICY.maxPartCount) {
    partSize = Math.ceil(sizeBytes / QUOTA_POLICY.maxPartCount);
    // Align to 5 MB boundary
    partSize = Math.ceil(partSize / QUOTA_POLICY.minPartSizeBytes) * QUOTA_POLICY.minPartSizeBytes;
  }

  const totalParts = Math.ceil(sizeBytes / partSize);
  return { partSize, totalParts };
}

/**
 * Selects upload transfer strategy based on file size and multipart threshold.
 * The threshold selects the transfer method, not a file rejection limit.
 */
export function selectUploadStrategy(sizeBytes: number): UploadStrategy {
  if (sizeBytes >= QUOTA_POLICY.multipartThresholdBytes) {
    return 'multipart';
  }
  return 'single_put';
}
