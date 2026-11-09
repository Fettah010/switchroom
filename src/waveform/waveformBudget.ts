/**
 * Resource policy for waveform generation.
 *
 * Playback is the priority; waveform analysis is secondary and bounded. Before
 * decoding, use file size and estimated decoded memory to decide whether to
 * attempt analysis or fall back to a plain progress rail.
 *
 * Budgets are deliberately conservative for desktop and even more conservative
 * on low-memory devices. `navigator.deviceMemory` is feature-detected and only
 * informs the budget; it is never required.
 *
 * Compressed formats get a tighter encoded-size ceiling because their decoded
 * duration cannot be inferred from the file size. A small MP3 can expand to
 * hours of PCM, so the source cap is the only safe pre-decode guard; the
 * decoded duration is checked again as soon as the browser reports it.
 */

export interface WaveformBudget {
  maxSourceBytes: number;
  /** Encoded-size ceiling for formats whose decoded duration is unknown. */
  maxCompressedSourceBytes: number;
  maxDecodedBytes: number;
  maxDurationSeconds: number;
  maxBucketCount: number;
  reason: 'ok' | 'too-large' | 'unknown-duration' | 'low-memory';
}

/** Extra decoded PCM held while channel copies are shipped to the worker. */
const ANALYSIS_COPY_FACTOR = 2;

/** Default limits, measured against a typical desktop machine. */
export const DEFAULT_BUDGET: WaveformBudget = {
  maxSourceBytes: 60 * 1024 * 1024, // 60 MB encoded input
  maxCompressedSourceBytes: 32 * 1024 * 1024, // 32 MB compressed input
  maxDecodedBytes: 240 * 1024 * 1024, // 240 MB decoded PCM ceiling
  maxDurationSeconds: 30 * 60,
  maxBucketCount: 2400,
  reason: 'ok',
};

/** Conservative limits for constrained/memory-constrained devices. */
export const LOW_MEMORY_BUDGET: WaveformBudget = {
  maxSourceBytes: 20 * 1024 * 1024, // 20 MB encoded input
  maxCompressedSourceBytes: 12 * 1024 * 1024, // 12 MB compressed input
  maxDecodedBytes: 60 * 1024 * 1024, // 60 MB decoded PCM ceiling
  maxDurationSeconds: 10 * 60,
  maxBucketCount: 1200,
  reason: 'ok',
};

/** Estimate decoded PCM bytes from duration, sample rate and channels. */
export function estimateDecodedBytes(
  durationSeconds: number | null,
  sampleRate: number | null,
  channelCount: number | null,
): number | null {
  if (
    durationSeconds === null ||
    sampleRate === null ||
    channelCount === null ||
    !Number.isFinite(durationSeconds) ||
    !Number.isFinite(sampleRate) ||
    !Number.isFinite(channelCount) ||
    durationSeconds <= 0
  ) {
    return null;
  }

  // Float32 per sample per channel.
  return durationSeconds * sampleRate * channelCount * 4;
}

function isCompressedExtension(extension: string | null): boolean {
  return extension !== null && extension !== 'wav';
}

/** Pick the budget based on device memory hints and file characteristics. */
export function selectBudget(
  fileSizeBytes: number,
  durationSeconds: number | null,
  sampleRate: number | null,
  channelCount: number | null,
  extension: string | null = null,
): WaveformBudget {
  const deviceMemory = (navigator as { deviceMemory?: number }).deviceMemory;

  const isLowMemory =
    typeof deviceMemory === 'number' && Number.isFinite(deviceMemory) && deviceMemory <= 4;

  const base = isLowMemory ? LOW_MEMORY_BUDGET : DEFAULT_BUDGET;

  // Encoded input larger than the source ceiling cannot be analysed safely.
  if (fileSizeBytes > base.maxSourceBytes) {
    return { ...base, reason: 'too-large' };
  }

  // A compressed file's decoded size is unrelated to its encoded size, so use
  // the tighter compressed ceiling until the decoder reports real metadata.
  if (durationSeconds === null && isCompressedExtension(extension)) {
    if (fileSizeBytes > base.maxCompressedSourceBytes) {
      return { ...base, reason: 'too-large' };
    }
    return { ...base, reason: 'unknown-duration' };
  }

  const decoded = estimateDecodedBytes(durationSeconds, sampleRate, channelCount);

  // Unknown duration: use a conservative per-MB heuristic so a huge file with
  // missing metadata still falls back rather than risking unbounded decode.
  if (decoded === null) {
    const estimatedFromSize = fileSizeBytes * 4; // Float32 worst case for 8-bit PCM
    if (estimatedFromSize > base.maxDecodedBytes) {
      return { ...base, reason: 'too-large' };
    }
    return { ...base, reason: 'unknown-duration' };
  }

  // The decoded AudioBuffer and the per-channel copies handed to the worker
  // coexist briefly, so budget for both.
  if (decoded * ANALYSIS_COPY_FACTOR > base.maxDecodedBytes) {
    return { ...base, reason: 'too-large' };
  }

  if (durationSeconds !== null && durationSeconds > base.maxDurationSeconds) {
    return { ...base, reason: 'too-large' };
  }

  return base;
}
