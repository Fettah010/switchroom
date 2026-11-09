import { describe, expect, it } from 'vitest';
import { sharedFraction } from './sharedFraction';
import type { WaveformSlotView } from '../../waveform/waveformTypes';

function view(durationSeconds: number | null): WaveformSlotView {
  return {
    version: 'original',
    state: 'ready',
    peaks:
      durationSeconds === null
        ? null
        : {
            version: 'original',
            durationSeconds,
            bucketCount: 4,
            peaks: new Float32Array(4),
            sourceGeneration: 1,
          },
    fileName: 'original.wav',
    durationSeconds,
    message: null,
  };
}

describe('sharedFraction', () => {
  it('uses the whole waveform when durations match', () => {
    expect(sharedFraction(view(4), 4)).toBe(1);
  });

  it('clips a longer waveform to the common duration', () => {
    expect(sharedFraction(view(3), 2.4)).toBeCloseTo(0.8, 5);
  });

  it('never stretches a shorter waveform beyond its own duration', () => {
    expect(sharedFraction(view(2), 4)).toBe(1);
  });

  it('falls back to the whole waveform when metadata is missing or invalid', () => {
    expect(sharedFraction(view(null), 4)).toBe(1);
    expect(sharedFraction(view(0), 4)).toBe(1);
    expect(sharedFraction(view(4), 0)).toBe(1);
    expect(sharedFraction(view(4), Number.NaN)).toBe(1);
  });
});
