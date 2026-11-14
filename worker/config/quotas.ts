// Centralized quota and lifecycle policies for Switchroom v0.5.0

import type { RetentionDays } from '../types';

export interface QuotaPolicy {
  /** Maximum single audio file size in bytes (100 MB). */
  maxFileSizeBytes: number;
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
  /** Playback presigned URL lifetime in seconds (1 hour). */
  playbackUrlTtlSeconds: number;
}

export const QUOTA_POLICY: QuotaPolicy = {
  maxFileSizeBytes: 100 * 1024 * 1024, // 100 MB = 104,857,600 bytes
  signedInMaxProjects: 20,
  signedInMaxStorageBytes: 2 * 1024 * 1024 * 1024, // 2 GB
  guestMaxProjects: 3,
  guestMaxStorageBytes: 300 * 1024 * 1024, // 300 MB
  uploadUrlTtlSeconds: 1800, // 30 minutes
  playbackUrlTtlSeconds: 3600, // 1 hour
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
