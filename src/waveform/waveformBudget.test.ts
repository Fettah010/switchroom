import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUDGET,
  LOW_MEMORY_BUDGET,
  selectBudget,
  estimateDecodedBytes,
} from './waveformBudget';

describe('waveformBudget', () => {
  it('accepts a normal-sized compressed file', () => {
    const budget = selectBudget(5 * 1024 * 1024, 60, 44100, 2, 'mp3');

    expect(budget.reason).toBe('ok');
    expect(budget.maxSourceBytes).toBe(DEFAULT_BUDGET.maxSourceBytes);
    expect(budget.maxDecodedBytes).toBe(DEFAULT_BUDGET.maxDecodedBytes);
  });

  it('accepts a full-length CD-quality WAV above the compressed ceiling', () => {
    // Regression: a 93 MB / 5:37 WAV is a normal song, not an oversized file.
    const budget = selectBudget(93 * 1024 * 1024, 337, 44100, 2, 'wav');

    expect(budget.reason).toBe('ok');
  });

  it('does not apply the decoded-PCM ceiling to a direct-read WAV', () => {
    // 30 minutes of stereo 44.1 kHz would exceed 1 GB if decoded to Float32,
    // but the worker scans the PCM source directly and never builds that copy.
    const budget = selectBudget(256 * 1024 * 1024, 30 * 60, 44100, 2, 'wav');

    expect(budget.reason).toBe('ok');
  });

  it('accepts a WAV at exactly the direct-read source ceiling', () => {
    const budget = selectBudget(DEFAULT_BUDGET.maxSourceBytes, 60, 44100, 2, 'wav');

    expect(budget.reason).toBe('ok');
  });

  it('rejects a WAV above the direct-read source ceiling', () => {
    const budget = selectBudget(DEFAULT_BUDGET.maxSourceBytes + 1, 60, 44100, 2, 'wav');

    expect(budget.reason).toBe('too-large');
  });

  it('proceeds with an unknown-duration WAV under the source ceiling', () => {
    const budget = selectBudget(93 * 1024 * 1024, null, null, null, 'wav');

    expect(budget.reason).toBe('unknown-duration');
  });

  it('falls back when a WAV exceeds the duration ceiling', () => {
    // Mono 8 kHz stays far below the source ceiling but runs past 30 minutes.
    const budget = selectBudget(1024, 31 * 60, 8000, 1, 'wav');

    expect(budget.reason).toBe('too-large');
  });

  it('uses the tighter compressed source ceiling for encoded formats', () => {
    const budget = selectBudget(
      DEFAULT_BUDGET.maxCompressedSourceBytes + 1,
      null,
      null,
      null,
      'mp3',
    );

    expect(budget.reason).toBe('too-large');
    expect(budget.maxCompressedSourceBytes).toBeLessThan(DEFAULT_BUDGET.maxSourceBytes);
  });

  it('accepts a compressed file under the compressed ceiling', () => {
    const budget = selectBudget(8 * 1024 * 1024, null, null, null, 'flac');

    expect(budget.reason).toBe('unknown-duration');
  });

  it('falls back when a compressed file decodes beyond the PCM ceiling', () => {
    // 121 MB decoded PCM is under the 240 MB ceiling on its own, but the
    // temporary channel copies sent to the worker push the footprint over it.
    const budget = selectBudget(
      5 * 1024 * 1024,
      (121 * 1024 * 1024) / (44100 * 2 * 4),
      44100,
      2,
      'mp3',
    );

    expect(budget.reason).toBe('too-large');
  });

  it('falls back when a compressed duration exceeds the duration ceiling', () => {
    const budget = selectBudget(1024, 31 * 60, 8000, 1, 'mp3');

    expect(budget.reason).toBe('too-large');
  });

  it('treats an unknown extension conservatively', () => {
    // Without a known extension there is no direct-read guarantee, so the
    // compressed ceiling applies.
    const budget = selectBudget(DEFAULT_BUDGET.maxCompressedSourceBytes + 1, 60, 44100, 2);

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
      const budget = selectBudget(5 * 1024 * 1024, 60, 44100, 2, 'wav');

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

  it('applies the low-memory WAV source ceiling', () => {
    const original = (navigator as { deviceMemory?: number }).deviceMemory;
    Object.defineProperty(navigator, 'deviceMemory', {
      value: 2,
      configurable: true,
    });

    try {
      const accepted = selectBudget(LOW_MEMORY_BUDGET.maxSourceBytes, 60, 44100, 2, 'wav');
      const rejected = selectBudget(LOW_MEMORY_BUDGET.maxSourceBytes + 1, 60, 44100, 2, 'wav');

      expect(accepted.reason).toBe('ok');
      expect(rejected.reason).toBe('too-large');
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
