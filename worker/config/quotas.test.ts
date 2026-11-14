import { describe, it, expect } from 'vitest';
import {
  QUOTA_POLICY,
  ALLOWED_RETENTION_DAYS,
  DEFAULT_RETENTION_DAYS,
  isValidRetention,
  computeExpiryTimestamp,
  isAllowedMimeType,
} from './quotas';

describe('worker quota and lifecycle policy', () => {
  it('enforces 100 MB max file size and correct retention defaults', () => {
    expect(QUOTA_POLICY.maxFileSizeBytes).toBe(104857600);
    expect(DEFAULT_RETENTION_DAYS).toBe(30);
    expect(ALLOWED_RETENTION_DAYS).toEqual([1, 7, 14, 30, 60, 90]);
  });

  it('validates retention choices strictly', () => {
    expect(isValidRetention(1)).toBe(true);
    expect(isValidRetention(7)).toBe(true);
    expect(isValidRetention(14)).toBe(true);
    expect(isValidRetention(30)).toBe(true);
    expect(isValidRetention(60)).toBe(true);
    expect(isValidRetention(90)).toBe(true);
    expect(isValidRetention(0 as unknown as number)).toBe(false);
    expect(isValidRetention(45 as unknown as number)).toBe(false);
    expect(isValidRetention(-1 as unknown as number)).toBe(false);
  });

  it('computes exact UTC expiry timestamps based on retention days', () => {
    const base = 1700000000000;
    const expiresAt = computeExpiryTimestamp(base, 7);
    expect(expiresAt).toBe(base + 7 * 24 * 60 * 60 * 1000);
  });

  it('validates audio mime types', () => {
    expect(isAllowedMimeType('audio/wav')).toBe(true);
    expect(isAllowedMimeType('audio/mpeg')).toBe(true);
    expect(isAllowedMimeType('audio/flac')).toBe(true);
    expect(isAllowedMimeType('audio/x-m4a')).toBe(true);
    expect(isAllowedMimeType('application/octet-stream')).toBe(true);
    expect(isAllowedMimeType('video/mp4')).toBe(false);
    expect(isAllowedMimeType('text/html')).toBe(false);
  });
});
