/**
 * PCM WAV parsing and direct peak extraction.
 *
 * The parser reads only the RIFF chunk table and a handful of header fields;
 * peak extraction then walks the `data` chunk bucket by bucket without ever
 * materialising a full Float32 copy of the file. That keeps waveform memory
 * proportional to the peak array (at most 2400 floats) instead of the decoded
 * duration, which matters for long local files.
 *
 * Supported encodings:
 *  - 8-bit unsigned PCM
 *  - 16-, 24- and 32-bit signed PCM
 *  - 32-bit IEEE float
 *  - WAVE_FORMAT_EXTENSIBLE wrapping any of the above
 */

import { MAX_BUCKET_COUNT, MIN_BUCKET_COUNT } from './peakExtraction';

export const WAVE_FORMAT_PCM = 1;
export const WAVE_FORMAT_IEEE_FLOAT = 3;
export const WAVE_FORMAT_EXTENSIBLE = 0xfffe;

export interface WavFormat {
  /** Resolved format tag (EXTENSIBLE is unwrapped to PCM or IEEE float). */
  audioFormat: number;
  channelCount: number;
  sampleRate: number;
  bitsPerSample: number;
  blockAlign: number;
  /** Byte offset of the first sample frame in the source buffer. */
  dataOffset: number;
  /** Byte length of the `data` chunk. */
  dataLength: number;
  /** Whole sample frames, derived from `dataLength / blockAlign`. */
  frameCount: number;
  durationSeconds: number;
}

export type WavParseFailure =
  | 'not-riff'
  | 'not-wave'
  | 'missing-fmt'
  | 'missing-data'
  | 'unsupported-format'
  | 'invalid-format'
  | 'truncated';

export type WavParseResult =
  { ok: true; format: WavFormat } | { ok: false; reason: WavParseFailure };

export interface WavParseOptions {
  /**
   * When true, trust the declared `data` chunk size even if the buffer only
   * contains its header. Used for cheap duration preflight on a file slice.
   */
  headerOnly?: boolean;
}

function readASCII(data: DataView, offset: number, length: number): string {
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += String.fromCharCode(data.getUint8(offset + index));
  }
  return out;
}

/** Parse the RIFF/WAVE header table. Never throws on malformed input. */
export function parseWavFormat(buffer: ArrayBuffer, options: WavParseOptions = {}): WavParseResult {
  if (buffer.byteLength < 12) {
    return { ok: false, reason: 'truncated' };
  }

  const data = new DataView(buffer);

  if (readASCII(data, 0, 4) !== 'RIFF') {
    return { ok: false, reason: 'not-riff' };
  }
  if (readASCII(data, 8, 4) !== 'WAVE') {
    return { ok: false, reason: 'not-wave' };
  }

  let audioFormat = 0;
  let channelCount = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let blockAlign = 0;
  let hasFormat = false;
  let dataOffset = -1;
  let dataLength = 0;

  let offset = 12;

  while (offset + 8 <= data.byteLength) {
    const chunkId = readASCII(data, offset, 4);
    const chunkSize = data.getUint32(offset + 4, true);
    const chunkDataStart = offset + 8;

    if (chunkDataStart + chunkSize > data.byteLength) {
      // A chunk that claims more bytes than the file contains is malformed.
      // A truncated `data` chunk can still be previewed safely, so clamp it
      // instead of discarding the whole file. In header-only mode the declared
      // size is trusted so duration preflight sees the real length.
      if (chunkId === 'data') {
        dataOffset = chunkDataStart;
        dataLength = options.headerOnly ? chunkSize : data.byteLength - chunkDataStart;
        break;
      }
      return { ok: false, reason: 'truncated' };
    }

    if (chunkId === 'fmt ') {
      if (chunkSize < 16) {
        return { ok: false, reason: 'invalid-format' };
      }

      const fmtView = new DataView(buffer, chunkDataStart, chunkSize);
      audioFormat = fmtView.getUint16(0, true);
      channelCount = fmtView.getUint16(2, true);
      sampleRate = fmtView.getUint32(4, true);
      blockAlign = fmtView.getUint16(12, true);
      bitsPerSample = fmtView.getUint16(14, true);

      // WAVE_FORMAT_EXTENSIBLE stores the real format in the first two bytes
      // of the SubFormat GUID at offset 24.
      if (audioFormat === WAVE_FORMAT_EXTENSIBLE) {
        if (chunkSize < 40) {
          return { ok: false, reason: 'invalid-format' };
        }
        audioFormat = fmtView.getUint16(24, true);
      }

      hasFormat = true;
    } else if (chunkId === 'data') {
      dataOffset = chunkDataStart;
      dataLength = chunkSize;
    }

    // RIFF chunks are word-aligned.
    offset = chunkDataStart + chunkSize + (chunkSize & 1);
  }

  if (!hasFormat) {
    return { ok: false, reason: 'missing-fmt' };
  }

  if (dataOffset < 0) {
    return { ok: false, reason: 'missing-data' };
  }

  if (audioFormat !== WAVE_FORMAT_PCM && audioFormat !== WAVE_FORMAT_IEEE_FLOAT) {
    return { ok: false, reason: 'unsupported-format' };
  }

  const bytesPerSample = bitsPerSample / 8;

  const validBits =
    bitsPerSample === 8 || bitsPerSample === 16 || bitsPerSample === 24 || bitsPerSample === 32;

  if (
    !validBits ||
    bitsPerSample % 8 !== 0 ||
    channelCount < 1 ||
    channelCount > 8 ||
    sampleRate <= 0 ||
    blockAlign < channelCount * bytesPerSample ||
    (audioFormat === WAVE_FORMAT_IEEE_FLOAT && bitsPerSample !== 32)
  ) {
    return { ok: false, reason: 'invalid-format' };
  }

  const frameCount = Math.floor(dataLength / blockAlign);
  const durationSeconds = frameCount / sampleRate;

  return {
    ok: true,
    format: {
      audioFormat,
      channelCount,
      sampleRate,
      bitsPerSample,
      blockAlign,
      dataOffset,
      dataLength,
      frameCount,
      durationSeconds,
    },
  };
}

/** Read one sample as a normalised float in [-1, 1]. */
function readSample(
  view: DataView,
  offset: number,
  bitsPerSample: number,
  audioFormat: number,
): number {
  switch (bitsPerSample) {
    case 8: {
      // 8-bit PCM is unsigned with a 128 midpoint.
      return (view.getUint8(offset) - 128) / 128;
    }
    case 16: {
      return view.getInt16(offset, true) / 32768;
    }
    case 24: {
      const b0 = view.getUint8(offset);
      const b1 = view.getUint8(offset + 1);
      const b2 = view.getUint8(offset + 2);
      const raw = b0 | (b1 << 8) | (b2 << 16);
      // Sign-extend 24 bits without shifting into the 32-bit sign bit, which
      // would corrupt large positive samples.
      const signed = raw >= 0x800000 ? raw - 0x1000000 : raw;
      return signed / 8388608;
    }
    case 32: {
      if (audioFormat === WAVE_FORMAT_IEEE_FLOAT) {
        return view.getFloat32(offset, true);
      }
      return view.getInt32(offset, true) / 2147483648;
    }
    default:
      return 0;
  }
}

function clampBucketCount(value: number): number {
  return Math.min(
    MAX_BUCKET_COUNT,
    Math.max(MIN_BUCKET_COUNT, Math.trunc(value) || MIN_BUCKET_COUNT),
  );
}

export interface WavPeakResult {
  peaks: Float32Array;
  format: WavFormat;
}

export type WavPeakFailure = WavParseFailure | 'cancelled';

export type WavPeakOutcome =
  { ok: true; result: WavPeakResult } | { ok: false; reason: WavPeakFailure };

export interface ExtractWavPeaksOptions {
  /** Polled once per bucket so long scans can bail out early. */
  shouldAbort?: () => boolean;
}

/**
 * Downsample a PCM WAV buffer into one peak magnitude per bucket.
 *
 * Each bucket covers an equal number of sample frames, so the result maps
 * directly onto a shared time axis. Values are finite and clamped to [0, 1].
 */
export function extractWavPeaks(
  buffer: ArrayBuffer,
  bucketCount: number,
  options: ExtractWavPeaksOptions = {},
): WavPeakOutcome {
  const parsed = parseWavFormat(buffer);

  if (!parsed.ok) {
    return parsed;
  }

  const { format } = parsed;
  const clamped = clampBucketCount(bucketCount);
  const peaks = new Float32Array(clamped);
  const bytesPerSample = format.bitsPerSample / 8;
  const view = new DataView(buffer, format.dataOffset, format.dataLength);
  const { frameCount, blockAlign, channelCount } = format;

  if (frameCount === 0) {
    return { ok: true, result: { peaks, format } };
  }

  const framesPerBucket = frameCount / clamped;

  for (let bucket = 0; bucket < clamped; bucket += 1) {
    if (options.shouldAbort?.()) {
      return { ok: false, reason: 'cancelled' };
    }

    const start = Math.floor(bucket * framesPerBucket);
    const end = Math.min(frameCount, Math.floor((bucket + 1) * framesPerBucket));
    let maxAbs = 0;

    for (let frame = start; frame < end; frame += 1) {
      const frameBase = frame * blockAlign;

      for (let channel = 0; channel < channelCount; channel += 1) {
        const value = readSample(
          view,
          frameBase + channel * bytesPerSample,
          format.bitsPerSample,
          format.audioFormat,
        );
        const magnitude = Number.isFinite(value) ? Math.abs(value) : 0;

        if (magnitude > maxAbs) {
          maxAbs = magnitude;
        }
      }
    }

    peaks[bucket] = maxAbs > 1 ? 1 : maxAbs;
  }

  return { ok: true, result: { peaks, format } };
}
