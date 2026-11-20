import { describe, it, expect } from 'vitest';
import {
  QUOTA_POLICY,
  ALLOWED_RETENTION_DAYS,
  DEFAULT_RETENTION_DAYS,
  isValidRetention,
  computeExpiryTimestamp,
  isAllowedMimeType,
  calculatePartSize,
  selectUploadStrategy,
} from './quotas';

describe('worker quota and lifecycle policy for v0.7.0', () => {
  it('enforces multipart threshold, budget, and correct retention defaults', () => {
    expect(QUOTA_POLICY.multipartThresholdBytes).toBe(50 * 1024 * 1024);
    expect(QUOTA_POLICY.switchroomAggregateBudgetBytes).toBe(8 * 1024 * 1024 * 1024);
    expect(DEFAULT_RETENTION_DAYS).toBe(30);
    expect(ALLOWED_RETENTION_DAYS).toEqual([1, 7, 14, 30, 60, 90]);
  });

  it('selects upload strategy without rejecting files', () => {
    // Below 50 MB -> single_put
    expect(selectUploadStrategy(10 * 1024 * 1024)).toBe('single_put');
    expect(selectUploadStrategy(49 * 1024 * 1024)).toBe('single_put');

    // At or above 50 MB -> multipart
    expect(selectUploadStrategy(50 * 1024 * 1024)).toBe('multipart');
    expect(selectUploadStrategy(150 * 1024 * 1024)).toBe('multipart');
    expect(selectUploadStrategy(500 * 1024 * 1024)).toBe('multipart');
  });

  it('calculates valid part sizes adhering to R2 invariants', () => {
    // 50 MB file: 8 MB parts -> 7 parts (6 x 8 MB, 1 x 2 MB)
    const res50 = calculatePartSize(50 * 1024 * 1024);
    expect(res50.partSize).toBe(8 * 1024 * 1024);
    expect(res50.totalParts).toBe(7);

    // 200 MB file: 8 MB parts -> 25 parts
    const res200 = calculatePartSize(200 * 1024 * 1024);
    expect(res200.partSize).toBe(8 * 1024 * 1024);
    expect(res200.totalParts).toBe(25);

    // Giant 100 GB file: should scale part size so parts <= 10,000
    const res100G = calculatePartSize(100 * 1024 * 1024 * 1024);
    expect(res100G.totalParts).toBeLessThanOrEqual(10_000);
    expect(res100G.partSize).toBeGreaterThanOrEqual(5 * 1024 * 1024);
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
