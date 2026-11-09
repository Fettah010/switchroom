import { describe, expect, it } from 'vitest';
import {
  MAX_BUCKET_COUNT,
  MIN_BUCKET_COUNT,
  extractPeaks,
  extractPeaksFromChannels,
} from './peakExtraction';

describe('peakExtraction', () => {
  it('extracts peaks from mono silence', () => {
    const samples = new Float32Array(1000).fill(0);
    const peaks = extractPeaks(samples, 1, 10);

    expect(peaks.length).toBe(10);
    expect([...peaks]).toEqual(new Array(10).fill(0));
  });

  it('extracts peaks from mono constant amplitude', () => {
    const samples = new Float32Array(1000).fill(0.5);
    const peaks = extractPeaks(samples, 1, 10);

    expect([...peaks]).toEqual(new Array(10).fill(0.5));
  });

  it('extracts peaks from mono impulse', () => {
    const samples = new Float32Array(1000).fill(0);
    samples[500] = 1;

    const peaks = extractPeaks(samples, 1, 10);
    // Bucket 5 covers samples 500-599.
    expect(peaks[5]).toBe(1);
    expect(peaks[4]).toBe(0);
    expect(peaks[6]).toBe(0);
  });

  it('clamps values above 1 to 1', () => {
    const samples = new Float32Array(100).fill(2);
    const peaks = extractPeaks(samples, 1, 4);

    expect([...peaks]).toEqual(new Array(4).fill(1));
  });

  it('treats non-finite samples as zero', () => {
    const samples = new Float32Array(100);
    samples[0] = NaN;
    samples[10] = Infinity;
    samples[20] = -Infinity;

    const peaks = extractPeaks(samples, 1, 4);
    expect([...peaks]).toEqual(new Array(4).fill(0));
  });

  it('handles positive and negative peaks', () => {
    const samples = new Float32Array(100).fill(0);
    samples[10] = -0.8;
    samples[90] = 0.6;

    const peaks = extractPeaks(samples, 1, 10);
    expect(peaks[1]).toBeCloseTo(0.8);
    expect(peaks[9]).toBeCloseTo(0.6);
  });

  it('handles odd sample count and final partial bucket', () => {
    const samples = new Float32Array(10).fill(0.5);
    samples[9] = 1;

    const peaks = extractPeaks(samples, 1, 3);
    expect(peaks.length).toBe(3);
    expect(peaks[2]).toBe(1);
  });

  it('bucket count of 1 returns one peak', () => {
    const samples = new Float32Array([0, 1, 0, -1]);
    const peaks = extractPeaks(samples, 1, 1);

    expect(peaks.length).toBe(1);
    expect(peaks[0]).toBe(1);
  });

  it('clamps bucket count to the maximum', () => {
    const samples = new Float32Array(100000).fill(0.3);
    const peaks = extractPeaks(samples, 1, 100000);

    expect(peaks.length).toBe(MAX_BUCKET_COUNT);
    for (let i = 0; i < peaks.length; i += 1) {
      expect(peaks[i]).toBeCloseTo(0.3);
    }
  });

  it('clamps bucket count to the minimum', () => {
    const samples = new Float32Array([0.5]);
    const peaks = extractPeaks(samples, 1, 0);

    expect(peaks.length).toBe(MIN_BUCKET_COUNT);
  });
  it('is deterministic for same input and config', () => {
    const samples = new Float32Array(1000);
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = Math.sin(i * 0.1);
    }

    const a = extractPeaks(samples, 2, 100);
    const b = extractPeaks(samples, 2, 100);

    expect([...a]).toEqual([...b]);
  });

  it('combines channels by maximum absolute amplitude', () => {
    // Channel 0: quiet. Channel 1: loud impulse at index 5.
    const ch0 = new Float32Array(10).fill(0.1);
    const ch1 = new Float32Array(10).fill(0);
    ch1[5] = 0.9;

    const peaks = extractPeaksFromChannels([ch0, ch1], 2);
    expect(peaks[0]).toBeCloseTo(0.1);
    expect(peaks[1]).toBeCloseTo(0.9);
  });

  it('handles a single channel', () => {
    const ch0 = new Float32Array([0, 0.5, 0]);
    const peaks = extractPeaksFromChannels([ch0], 2);
    // 3 samples across 2 buckets: bucket 0 -> index 0, bucket 1 -> indices 1-2.
    expect(peaks[0]).toBeCloseTo(0);
    expect(peaks[1]).toBeCloseTo(0.5);
  });
});
