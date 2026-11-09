import { describe, expect, it } from 'vitest';
import {
  extractWavPeaks,
  parseWavFormat,
  WAVE_FORMAT_EXTENSIBLE,
  WAVE_FORMAT_IEEE_FLOAT,
  WAVE_FORMAT_PCM,
} from './wavParser';

interface WavOptions {
  channels: number;
  sampleRate?: number;
  bitsPerSample: number;
  audioFormat?: number;
  extensible?: boolean;
  frames: number[][];
  extraChunk?: boolean;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function encodeWav({
  channels,
  sampleRate = 8000,
  bitsPerSample,
  audioFormat = WAVE_FORMAT_PCM,
  extensible = false,
  frames,
  extraChunk = false,
}: WavOptions): ArrayBuffer {
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const dataLength = frames.length * blockAlign;
  const fmtSize = extensible ? 40 : 16;
  const extraSize = extraChunk ? 12 : 0;
  const total = 12 + 8 + fmtSize + extraSize + 8 + dataLength;

  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, total - 8, true);
  writeAscii(view, 8, 'WAVE');

  let offset = 12;

  writeAscii(view, offset, 'fmt ');
  view.setUint32(offset + 4, fmtSize, true);
  view.setUint16(offset + 8, extensible ? WAVE_FORMAT_EXTENSIBLE : audioFormat, true);
  view.setUint16(offset + 10, channels, true);
  view.setUint32(offset + 12, sampleRate, true);
  view.setUint32(offset + 16, sampleRate * blockAlign, true);
  view.setUint16(offset + 20, blockAlign, true);
  view.setUint16(offset + 22, bitsPerSample, true);

  if (extensible) {
    view.setUint16(offset + 24, 22, true); // cbSize
    view.setUint16(offset + 26, bitsPerSample, true); // valid bits
    view.setUint32(offset + 28, 0, true); // channel mask
    view.setUint16(offset + 32, audioFormat, true); // SubFormat GUID, first field
  }

  offset += 8 + fmtSize;

  if (extraChunk) {
    writeAscii(view, offset, 'LIST');
    view.setUint32(offset + 4, 4, true);
    writeAscii(view, offset + 8, 'INFO');
    offset += 12;
  }

  writeAscii(view, offset, 'data');
  view.setUint32(offset + 4, dataLength, true);
  offset += 8;

  for (const frame of frames) {
    for (let channel = 0; channel < channels; channel += 1) {
      const value = frame[channel] ?? 0;
      const sampleOffset = offset;

      if (bitsPerSample === 8) {
        view.setUint8(sampleOffset, Math.round(value * 127) + 128);
      } else if (bitsPerSample === 16) {
        view.setInt16(sampleOffset, Math.round(value * 32767), true);
      } else if (bitsPerSample === 24) {
        const raw = Math.round(value * 8388607);
        const unsigned = raw < 0 ? raw + 0x1000000 : raw;
        view.setUint8(sampleOffset, unsigned & 0xff);
        view.setUint8(sampleOffset + 1, (unsigned >> 8) & 0xff);
        view.setUint8(sampleOffset + 2, (unsigned >> 16) & 0xff);
      } else if (bitsPerSample === 32) {
        if (audioFormat === WAVE_FORMAT_IEEE_FLOAT) {
          view.setFloat32(sampleOffset, value, true);
        } else {
          view.setInt32(sampleOffset, Math.round(value * 2147483647), true);
        }
      }

      offset += bytesPerSample;
    }
  }

  return buffer;
}

describe('parseWavFormat', () => {
  it('reads mono 16-bit PCM metadata', () => {
    const buffer = encodeWav({
      channels: 1,
      sampleRate: 44100,
      bitsPerSample: 16,
      frames: [[0], [0.5], [-0.5], [1]],
    });

    const result = parseWavFormat(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.format).toMatchObject({
      audioFormat: WAVE_FORMAT_PCM,
      channelCount: 1,
      sampleRate: 44100,
      bitsPerSample: 16,
      blockAlign: 2,
      frameCount: 4,
      durationSeconds: 4 / 44100,
    });
  });

  it('counts stereo frames with block alignment, not per-sample bytes', () => {
    const buffer = encodeWav({
      channels: 2,
      sampleRate: 8000,
      bitsPerSample: 16,
      frames: [
        [0.25, -0.25],
        [0.5, -0.5],
      ],
    });

    const result = parseWavFormat(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.format.blockAlign).toBe(4);
    expect(result.format.frameCount).toBe(2);
    expect(result.format.durationSeconds).toBe(2 / 8000);
  });

  it('skips unrelated chunks between fmt and data', () => {
    const buffer = encodeWav({
      channels: 1,
      bitsPerSample: 16,
      extraChunk: true,
      frames: [[0.1], [0.2]],
    });

    const result = parseWavFormat(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format.frameCount).toBe(2);
  });

  it('unwraps WAVE_FORMAT_EXTENSIBLE to the SubFormat tag', () => {
    const buffer = encodeWav({
      channels: 2,
      bitsPerSample: 24,
      audioFormat: WAVE_FORMAT_PCM,
      extensible: true,
      frames: [
        [0.1, -0.1],
        [0.2, -0.2],
      ],
    });

    const result = parseWavFormat(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format.audioFormat).toBe(WAVE_FORMAT_PCM);
    expect(result.format.bitsPerSample).toBe(24);
    expect(result.format.frameCount).toBe(2);
  });

  it('rejects non-RIFF and missing chunks honestly', () => {
    expect(parseWavFormat(new ArrayBuffer(4))).toEqual({ ok: false, reason: 'truncated' });

    const buffer = new ArrayBuffer(12);
    const view = new DataView(buffer);
    writeAscii(view, 0, 'NOPE');
    writeAscii(view, 8, 'WAVE');
    expect(parseWavFormat(buffer)).toEqual({ ok: false, reason: 'not-riff' });
  });

  it('rejects compressed encodings it cannot analyse', () => {
    const buffer = encodeWav({
      channels: 1,
      bitsPerSample: 16,
      audioFormat: 6, // A-law
      frames: [[0]],
    });

    expect(parseWavFormat(buffer)).toEqual({ ok: false, reason: 'unsupported-format' });
  });

  it('clamps a truncated data chunk instead of throwing', () => {
    const buffer = encodeWav({
      channels: 1,
      bitsPerSample: 16,
      frames: [[0.1], [0.2], [0.3]],
    });
    // Claim four more bytes than the file actually contains.
    const view = new DataView(buffer);
    const dataSizeOffset = 12 + 8 + 16 + 4;
    view.setUint32(dataSizeOffset, view.getUint32(dataSizeOffset, true) + 4, true);

    const result = parseWavFormat(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format.frameCount).toBe(3);
  });
});

describe('extractWavPeaks', () => {
  it('produces one bounded peak per bucket from mono samples', () => {
    const buffer = encodeWav({
      channels: 1,
      sampleRate: 8000,
      bitsPerSample: 16,
      frames: [[0], [0.5], [-1], [0.25]],
    });

    const outcome = extractWavPeaks(buffer, 2);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.peaks[0]).toBeCloseTo(0.5, 3);
    expect(outcome.result.peaks[1]).toBeCloseTo(1, 3);
  });

  it('takes the maximum magnitude across stereo channels', () => {
    const buffer = encodeWav({
      channels: 2,
      sampleRate: 8000,
      bitsPerSample: 16,
      frames: [
        [0.2, -0.8],
        [0.6, -0.1],
      ],
    });

    const outcome = extractWavPeaks(buffer, 1);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.peaks[0]).toBeCloseTo(0.8, 2);
  });

  it('sign-extends 24-bit samples correctly at both extremes', () => {
    const positive = 0.999;
    const negative = -0.999;
    const buffer = encodeWav({
      channels: 1,
      sampleRate: 8000,
      bitsPerSample: 24,
      frames: [[positive], [negative], [0]],
    });

    const outcome = extractWavPeaks(buffer, 2);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.peaks[0]).toBeCloseTo(positive, 2);
    expect(outcome.result.peaks[1]).toBeCloseTo(0.999, 2);
  });

  it('reads 32-bit IEEE float samples', () => {
    const buffer = encodeWav({
      channels: 1,
      sampleRate: 8000,
      bitsPerSample: 32,
      audioFormat: WAVE_FORMAT_IEEE_FLOAT,
      frames: [[0.3], [-0.7]],
    });

    const outcome = extractWavPeaks(buffer, 1);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.peaks[0]).toBeCloseTo(0.7, 3);
  });

  it('clamps peak values into [0, 1]', () => {
    const buffer = encodeWav({
      channels: 1,
      sampleRate: 8000,
      bitsPerSample: 32,
      audioFormat: WAVE_FORMAT_IEEE_FLOAT,
      frames: [[1.8], [-2.4]],
    });

    const outcome = extractWavPeaks(buffer, 1);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.peaks[0]).toBe(1);
  });

  it('can be aborted between buckets', () => {
    const buffer = encodeWav({
      channels: 1,
      sampleRate: 8000,
      bitsPerSample: 16,
      frames: [[0.1], [0.2], [0.3], [0.4]],
    });

    let calls = 0;
    const outcome = extractWavPeaks(buffer, 4, {
      shouldAbort: () => {
        calls += 1;
        return calls > 1;
      },
    });

    expect(outcome).toEqual({ ok: false, reason: 'cancelled' });
  });
});
