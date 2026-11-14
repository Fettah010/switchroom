import { describe, it, expect } from 'vitest';
import {
  generateGuestOwnerCapability,
  hashCapability,
  generateOpaqueId,
  sanitizeFilename,
} from './crypto';

describe('worker crypto service', () => {
  it('generates high-entropy guest owner capability with sw_owner_ prefix', () => {
    const cap1 = generateGuestOwnerCapability();
    const cap2 = generateGuestOwnerCapability();

    expect(cap1).toMatch(/^sw_owner_[0-9a-f]{64}$/);
    expect(cap2).toMatch(/^sw_owner_[0-9a-f]{64}$/);
    expect(cap1).not.toBe(cap2);
  });

  it('hashes capability deterministically with SHA-256 hex string', async () => {
    const cap = 'sw_owner_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const hash1 = await hashCapability(cap);
    const hash2 = await hashCapability(cap);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);

    const differentHash = await hashCapability(cap + 'a');
    expect(hash1).not.toBe(differentHash);
  });

  it('generates opaque IDs with requested prefix and 32-char hex random suffix', () => {
    const projId = generateOpaqueId('proj');
    expect(projId).toMatch(/^proj_[0-9a-f]{32}$/);

    const assetId = generateOpaqueId('asset');
    expect(assetId).toMatch(/^asset_[0-9a-f]{32}$/);
  });

  it('sanitizes user filenames safely for storage and display', () => {
    expect(sanitizeFilename('my track (mix 2).wav')).toBe('my track _mix 2_.wav');
    expect(sanitizeFilename('../../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('')).toBe('unnamed-audio');
    expect(sanitizeFilename('valid-name_01.mp3')).toBe('valid-name_01.mp3');
  });
});
