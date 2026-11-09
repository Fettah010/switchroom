import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUDGET,
  LOW_MEMORY_BUDGET,
  selectBudget,
  estimateDecodedBytes,
} from './waveformBudget';

describe('waveformBudget', () => {
  it('accepts a normal-sized file', () => {
    const budget = selectBudget(5 * 1024 * 1024, 60, 44100, 2);

    expect(budget.reason).toBe('ok');
    expect(budget.maxSourceBytes).toBe(DEFAULT_BUDGET.maxSourceBytes);
    expect(budget.maxDecodedBytes).toBe(DEFAULT_BUDGET.maxDecodedBytes);
  });

  it('falls back when the source file is too large', () => {
    const budget = selectBudget(100 * 1024 * 1024, 600, 44100, 2);

    expect(budget.reason).toBe('too-large');
    expect(budget.maxSourceBytes).toBeLessThanOrEqual(100 * 1024 * 1024);
  });

  it('falls back when estimated decoded size exceeds the budget', () => {
    // 1 hour of stereo 44.1 kHz float32 PCM is well over the default ceiling.
    const budget = selectBudget(5 * 1024 * 1024, 3600, 44100, 2);

    expect(budget.reason).toBe('too-large');
  });

  it('uses a conservative budget when duration is unknown but size is small', () => {
    const budget = selectBudget(5 * 1024 * 1024, null, null, null);

    expect(budget.reason).toBe('unknown-duration');
  });

  it('uses a conservative budget when duration is unknown and size is huge', () => {
    const budget = selectBudget(400 * 1024 * 1024, null, null, null);

    expect(budget.reason).toBe('too-large');
  });

  it('triggers low-memory budget when deviceMemory is <= 4 GB', () => {
    const original = (navigator as { deviceMemory?: number }).deviceMemory;
    Object.defineProperty(navigator, 'deviceMemory', {
      value: 2,
      configurable: true,
    });

    try {
      const budget = selectBudget(5 * 1024 * 1024, 60, 44100, 2);

      expect(budget.maxSourceBytes).toBe(LOW_MEMORY_BUDGET.maxSourceBytes);
      expect(budget.maxDecodedBytes).toBe(LOW_MEMORY_BUDGET.maxDecodedBytes);
      expect(budget.maxBucketCount).toBe(LOW_MEMORY_BUDGET.maxBucketCount);
    } finally {
      Object.defineProperty(navigator, 'deviceMemory', {
        value: original,
        configurable: true,
      });
    }
  });

  it('estimates decoded bytes for known duration/rate/channels', () => {
    // 60 s * 44100 Hz * 2 ch * 4 bytes = 21,168,000
    const bytes = estimateDecodedBytes(60, 44100, 2);

    expect(bytes).toBe(60 * 44100 * 2 * 4);
  });

  it('returns null for missing metadata', () => {
    expect(estimateDecodedBytes(null, 44100, 2)).toBeNull();
    expect(estimateDecodedBytes(60, null, 2)).toBeNull();
    expect(estimateDecodedBytes(60, 44100, null)).toBeNull();
    expect(estimateDecodedBytes(0, 44100, 2)).toBeNull();
  });

  it('never produces negative, NaN or infinite budget calculations', () => {
    const budget = selectBudget(-1, -60, -44100, -2);

    expect(Number.isFinite(budget.maxSourceBytes)).toBe(true);
    expect(Number.isFinite(budget.maxDecodedBytes)).toBe(true);
    expect(Number.isFinite(budget.maxBucketCount)).toBe(true);
    expect(budget.maxBucketCount).toBeGreaterThan(0);
  });
});
