/**
 * Dedicated Worker for CPU-heavy waveform analysis.
 *
 * Responsibilities:
 *  - Parse common PCM WAV files directly from an ArrayBuffer (no browser
 *    decoder required).
 *  - Downsample decoded PCM into bounded peak buckets (mono envelope).
 *  - Return compact, transferable peak data; never return raw PCM.
 *
 * The main thread owns AudioContext/decodeAudioData for non-WAV codecs and
 * only ships already-decoded Float32 channels here for reduction.
 *
 * Self-contained: no imports, so it compiles cleanly as a Vite worker module
 * and has no dependency on the main bundle.
 */

type WaveformRequest =
  | {
      type: 'analyze-wav';
      requestId: string;
      fileGeneration: number;
      buffer: ArrayBuffer;
      bucketCount: number;
    }
  | {
      type: 'extract-peaks';
      requestId: string;
      fileGeneration: number;
      channels: Float32Array[];
      sampleRate: number;
      durationSeconds: number;
      bucketCount: number;
    };

type CancelRequest = {
  type: 'cancel';
  requestId: string;
  fileGeneration: number;
};

type WaveformSuccess = {
  type: 'success';
  requestId: string;
  fileGeneration: number;
  durationSeconds: number;
  sampleRate: number;
  channelCount: number;
  bucketCount: number;
  peaks: ArrayBuffer;
};

type WaveformFailure = {
  type: 'failure';
  requestId: string;
  fileGeneration: number;
  reason: 'unsupported' | 'decode-failed' | 'cancelled' | 'internal';
};

const MAX_BUCKET_COUNT = 2400;
const MIN_BUCKET_COUNT = 1;

/** Read a little-endian unsigned 32-bit integer at offset. */
function readUInt32(data: DataView, offset: number): number {
  return data.getUint32(offset, true);
}

function readASCII(data: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(data.getUint8(offset + i));
  }
  return out;
}

/**
 * Parse a common PCM WAV (RIFF/WAVE) file into interleaved Float32 samples in
 * [-1, 1]. Handles 8-bit unsigned, 16-bit, 24-bit and 32-bit PCM, mono or
 * stereo, and ignores non-data chunks between fmt and data.
 *
 * Returns null when the file is not a parseable PCM WAV.
 */
function parseWavPcm(buffer: ArrayBuffer): {
  samples: Float32Array;
  sampleRate: number;
  channelCount: number;
  durationSeconds: number;
} | null {
  const data = new DataView(buffer);

  if (buffer.byteLength < 12) {
    return null;
  }

  if (readASCII(data, 0, 4) !== 'RIFF') {
    return null;
  }
  if (readASCII(data, 8, 4) !== 'WAVE') {
    return null;
  }

  let format: {
    audioFormat: number;
    channelCount: number;
    sampleRate: number;
    bitsPerSample: number;
    blockAlign: number;
  } | null = null;
  let dataChunkByteOffset = -1;
  let dataChunkByteLength = 0;

  let offset = 12;

  while (offset + 8 <= data.byteLength) {
    const chunkId = readASCII(data, offset, 4);
    const chunkSize = readUInt32(data, offset + 4);
    const chunkDataStart = offset + 8;

    if (chunkDataStart + chunkSize > data.byteLength) {
      // Malformed chunk; stop scanning.
      break;
    }

    if (chunkId === 'fmt ') {
      if (chunkSize < 16) {
        return null;
      }
      const fmtView = new DataView(buffer, chunkDataStart, chunkSize);
      format = {
        audioFormat: fmtView.getUint16(0, true),
        channelCount: fmtView.getUint16(2, true),
        sampleRate: fmtView.getUint32(4, true),
        bitsPerSample: fmtView.getUint16(14, true),
        blockAlign: fmtView.getUint16(12, true),
      };
    } else if (chunkId === 'data') {
      dataChunkByteOffset = chunkDataStart;
      dataChunkByteLength = chunkSize;
    }

    // Chunks are word-aligned: pad to even size.
    offset = chunkDataStart + chunkSize + (chunkSize & 1);
  }

  if (!format) {
    return null;
  }

  // Only uncompressed PCM (format 1) or PCM float (format 3) are analysed here.
  if (format.audioFormat !== 1 && format.audioFormat !== 3) {
    return null;
  }

  if (
    format.channelCount < 1 ||
    format.channelCount > 8 ||
    format.bitsPerSample < 8 ||
    format.bitsPerSample > 32 ||
    format.bitsPerSample % 8 !== 0 ||
    format.sampleRate <= 0
  ) {
    return null;
  }

  if (dataChunkByteOffset < 0 || dataChunkByteLength === 0) {
    return null;
  }

  const bytesPerSample = format.bitsPerSample / 8;
  const frameCount = Math.floor(dataChunkByteLength / bytesPerSample);
  const samples = new Float32Array(frameCount * format.channelCount);

  const view = new DataView(buffer, dataChunkByteOffset, dataChunkByteLength);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const base = frame * bytesPerSample;
    for (let channel = 0; channel < format.channelCount; channel += 1) {
      const sampleBase = base + channel * bytesPerSample;
      let value = 0;

      if (format.bitsPerSample === 8) {
        // 8-bit PCM is unsigned, centred at 128.
        const unsigned = view.getUint8(sampleBase);
        value = (unsigned - 128) / 128;
      } else if (format.bitsPerSample === 16) {
        value = view.getInt16(sampleBase, true) / 32768;
      } else if (format.bitsPerSample === 24) {
        const b0 = view.getUint8(sampleBase);
        const b1 = view.getUint8(sampleBase + 1);
        const b2 = view.getUint8(sampleBase + 2);
        let signed = (b0 | (b1 << 8) | (b2 << 16)) << 8; // sign-extend
        signed = signed / 256; // arithmetic shift equivalent
        value = signed / 8388608;
      } else if (format.bitsPerSample === 32) {
        if (format.audioFormat === 3) {
          value = view.getFloat32(sampleBase, true);
        } else {
          value = view.getInt32(sampleBase, true) / 2147483648;
        }
      }

      samples[frame * format.channelCount + channel] = value > 1 ? 1 : value < -1 ? -1 : value;
    }
  }

  const durationSeconds = frameCount / format.sampleRate;

  return {
    samples,
    sampleRate: format.sampleRate,
    channelCount: format.channelCount,
    durationSeconds,
  };
}

function clampBucketCount(value: number): number {
  return Math.min(MAX_BUCKET_COUNT, Math.max(MIN_BUCKET_COUNT, Math.trunc(value)));
}

function extractPeaks(
  samples: Float32Array,
  channelCount: number,
  bucketCount: number,
): Float32Array {
  const clamped = clampBucketCount(bucketCount);
  const peaks = new Float32Array(clamped);
  const sampleCount = samples.length;

  if (sampleCount === 0 || clamped < 1) {
    return peaks;
  }

  const samplesPerBucket = sampleCount / clamped;

  for (let bucket = 0; bucket < clamped; bucket += 1) {
    const start = Math.floor(bucket * samplesPerBucket);
    const end = Math.min(sampleCount, Math.floor((bucket + 1) * samplesPerBucket));
    let maxAbs = 0;

    for (let i = start; i < end; i += channelCount) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        const value = samples[i + channel] ?? 0;
        const magnitude = Math.abs(value);
        if (magnitude > maxAbs) {
          maxAbs = magnitude;
        }
      }
    }

    peaks[bucket] = maxAbs > 1 ? 1 : maxAbs;
  }

  return peaks;
}

function extractPeaksFromChannels(channels: Float32Array[], bucketCount: number): Float32Array {
  const clamped = clampBucketCount(bucketCount);
  const peaks = new Float32Array(clamped);
  const channelCount = channels.length;
  const first = channels[0];
  const sampleCount = first ? first.length : 0;

  if (sampleCount === 0 || clamped < 1 || channelCount < 1) {
    return peaks;
  }

  const samplesPerBucket = sampleCount / clamped;

  for (let bucket = 0; bucket < clamped; bucket += 1) {
    const start = Math.floor(bucket * samplesPerBucket);
    const end = Math.min(sampleCount, Math.floor((bucket + 1) * samplesPerBucket));
    let maxAbs = 0;

    for (let i = start; i < end; i += 1) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        const channelData = channels[channel];
        if (!channelData) {
          continue;
        }
        const value = channelData[i] ?? 0;
        const magnitude = Math.abs(value);
        if (magnitude > maxAbs) {
          maxAbs = magnitude;
        }
      }
    }

    peaks[bucket] = maxAbs > 1 ? 1 : maxAbs;
  }

  return peaks;
}

function postSuccess(
  port: MessagePort | null,
  request: WaveformRequest,
  durationSeconds: number,
  sampleRate: number,
  channelCount: number,
  peaks: Float32Array,
): void {
  if (!port) {
    return;
  }

  const message: WaveformSuccess = {
    type: 'success',
    requestId: request.requestId,
    fileGeneration: request.fileGeneration,
    durationSeconds,
    sampleRate,
    channelCount,
    bucketCount: peaks.length,
    peaks: peaks.buffer as ArrayBuffer,
  };

  port.postMessage(message, [peaks.buffer as ArrayBuffer]);
}

function postFailure(
  port: MessagePort | null,
  request: WaveformRequest | CancelRequest,
  reason: WaveformFailure['reason'],
): void {
  if (!port) {
    return;
  }

  const message: WaveformFailure = {
    type: 'failure',
    requestId: request.requestId,
    fileGeneration: request.fileGeneration,
    reason,
  };

  port.postMessage(message);
}

let activeRequestId: string | null = null;
let abort = false;

function cancelActive(): void {
  abort = true;
  activeRequestId = null;
}

self.addEventListener('message', (event: MessageEvent) => {
  const message = event.data as WaveformRequest | CancelRequest;
  const port = (event.ports as unknown as MessagePort[])[0] ?? null;

  // A new request cancels any in-flight analysis.
  if (activeRequestId !== null && activeRequestId !== message.requestId) {
    cancelActive();
  }

  if (message.type === 'cancel') {
    cancelActive();
    return;
  }

  abort = false;
  activeRequestId = message.requestId;

  try {
    if (message.type === 'analyze-wav') {
      if (abort) return;

      const parsed = parseWavPcm(message.buffer);

      if (abort) return;

      if (!parsed) {
        postFailure(port, message, 'unsupported');
        return;
      }

      const peaks = extractPeaks(parsed.samples, parsed.channelCount, message.bucketCount);

      if (abort) return;

      postSuccess(
        port,
        message,
        parsed.durationSeconds,
        parsed.sampleRate,
        parsed.channelCount,
        peaks,
      );
    } else if (message.type === 'extract-peaks') {
      if (abort) return;

      const peaks = extractPeaksFromChannels(message.channels, message.bucketCount);

      if (abort) return;

      postSuccess(
        port,
        message,
        message.durationSeconds,
        message.sampleRate,
        message.channels.length,
        peaks,
      );
    }
  } catch {
    if (!abort) {
      postFailure(port, message, 'internal');
    }
  } finally {
    if (activeRequestId === message.requestId) {
      activeRequestId = null;
      abort = false;
    }
  }
});

export {};
