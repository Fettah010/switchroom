// Unit tests for the pure functions in the v0.6 sharing service.
// These avoid D1 entirely and only cover token shape, digests and derived state.
import { describe, expect, it } from 'vitest';
import type { ShareLinkRow } from '../types';
import {
  createSharePresignedGetUrl,
  generateShareToken,
  hashToken,
  isLinkActive,
  validateTokenShape,
} from './sharing';

describe('generateShareToken', () => {
  it('issues a prefixed, 256-bit URL-safe token and a distinct SHA-256 digest', async () => {
    const a = await generateShareToken();
    const b = await generateShareToken();

    expect(a.token).toMatch(/^shr_[A-Za-z0-9_-]{43,44}$/);
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it('digests a token deterministically', async () => {
    const one = await hashToken('shr_abcd');
    const two = await hashToken('shr_abcd');
    expect(one).toBe(two);
    expect(one).not.toBe(await hashToken('shr_abce'));
  });
});

describe('validateTokenShape', () => {
  it('accepts well-formed tokens and rejects malformed ones before database access', () => {
    const good = 'shr_' + 'a'.repeat(43);
    expect(validateTokenShape(good)).toBe(true);
    expect(validateTokenShape('shr_')).toBe(false); // empty body
    expect(validateTokenShape('shr_' + 'a'.repeat(129))).toBe(false); // too long
    expect(validateTokenShape('shr_!invalid')).toBe(false); // non URL-safe alphabet
    expect(validateTokenShape('not-a-token')).toBe(false); // missing prefix
    expect(validateTokenShape('')).toBe(false);
  });
});

describe('isLinkActive', () => {
  const now = 1_000_000;
  const link = (overrides: Partial<ShareLinkRow>): ShareLinkRow => ({
    id: 'link_test',
    project_id: 'project_test',
    token_hash: '0'.repeat(64),
    kind: 'primary',
    scope: 'listen',
    label: null,
    expires_at: null,
    revoked_at: null,
    created_at: now - 1000,
    last_used_at: null,
    ...overrides,
  });

  it('treats a revoked link as inactive', () => {
    expect(isLinkActive(link({ revoked_at: now }), now, { projectExpired: false })).toBe(false);
  });

  it('treats a link revoked at zero as active', () => {
    expect(isLinkActive(link({ revoked_at: 0 }), now, { projectExpired: false })).toBe(true);
  });

  it('treats an expired link as inactive', () => {
    expect(isLinkActive(link({ expires_at: now }), now, { projectExpired: false })).toBe(false);
    expect(isLinkActive(link({ expires_at: now - 1 }), now, { projectExpired: false })).toBe(false);
  });

  it('treats an expired project as inactive', () => {
    expect(isLinkActive(link({}), now, { projectExpired: true })).toBe(false);
  });

  it('treats a live link as active', () => {
    expect(isLinkActive(link({ expires_at: now + 1000 }), now, { projectExpired: false })).toBe(
      true,
    );
  });
});

describe('createSharePresignedGetUrl', () => {
  it('uses the development mock only for loopback origins', async () => {
    await expect(
      createSharePresignedGetUrl({} as never, 'http://127.0.0.1:4173', 'asset-key', 300),
    ).resolves.toBe('http://127.0.0.1:4173/api/dev-r2-mock/asset-key');
  });

  it('fails closed when production R2 signing credentials are missing', async () => {
    await expect(
      createSharePresignedGetUrl(
        {} as never,
        'https://switchroom.ftallfettah.workers.dev',
        'asset-key',
        300,
      ),
    ).rejects.toThrow('Private audio storage is not configured');
  });
});
