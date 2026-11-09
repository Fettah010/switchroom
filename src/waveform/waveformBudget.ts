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
 * PCM WAV is read directly by the worker and never expanded into a full
 * Float32 copy, so its real footprint is the source file plus the compact
 * peaks. Its source ceiling is therefore much higher than a compressed file's:
 * a normal full-length CD-quality WAV is 60–100 MB.
 *
 * Compressed formats get a tighter encoded-size ceiling because their decoded
 * duration cannot be inferred from the file size. A small MP3 can expand to
 * hours of PCM, so the source cap is the only safe pre-decode guard; the
 * decoded duration is checked again as soon as the browser reports it.
 */

export interface WaveformBudget {
  /** Direct-read (WAV) source ceiling; source size is the memory bound. */
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
  maxSourceBytes: 256 * 1024 * 1024, // 256 MB direct-read WAV input
  maxCompressedSourceBytes: 32 * 1024 * 1024, // 32 MB compressed input
  maxDecodedBytes: 240 * 1024 * 1024, // 240 MB decoded PCM ceiling
  maxDurationSeconds: 30 * 60,
  maxBucketCount: 2400,
  reason: 'ok',
};

/** Conservative limits for constrained/memory-constrained devices. */
export const LOW_MEMORY_BUDGET: WaveformBudget = {
  maxSourceBytes: 128 * 1024 * 1024, // 128 MB direct-read WAV input
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

function hasUsableDuration(durationSeconds: number | null): durationSeconds is number {
  return durationSeconds !== null && Number.isFinite(durationSeconds) && durationSeconds > 0;
}

function isUsableSize(fileSizeBytes: number): boolean {
  return Number.isFinite(fileSizeBytes) && fileSizeBytes >= 0;
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

  // PCM WAV is parsed and reduced straight from the source buffer, so no
  // decoded Float32 copy exists to budget for. Source size is the real memory
  // bound, and a normal full-length CD-quality WAV (60–100 MB) must pass.
  if (extension === 'wav') {
    if (!isUsableSize(fileSizeBytes) || fileSizeBytes > base.maxSourceBytes) {
      return { ...base, reason: 'too-large' };
    }

    // Without a duration the worker can still scan safely; the source ceiling
    // already bounds the work.
    if (!hasUsableDuration(durationSeconds)) {
      return { ...base, reason: 'unknown-duration' };
    }

    if (durationSeconds > base.maxDurationSeconds) {
      return { ...base, reason: 'too-large' };
    }

    return base;
  }

  // Compressed (or unknown) formats: encoded size says little about decoded
  // size, so apply the tighter encoded ceiling and estimate the decoded PCM.
  if (!isUsableSize(fileSizeBytes) || fileSizeBytes > base.maxCompressedSourceBytes) {
    return { ...base, reason: 'too-large' };
  }

  if (!hasUsableDuration(durationSeconds)) {
    return { ...base, reason: 'unknown-duration' };
  }

  const decoded = estimateDecodedBytes(durationSeconds, sampleRate, channelCount);

  if (decoded === null) {
    return { ...base, reason: 'unknown-duration' };
  }

  // The decoded AudioBuffer and the per-channel copies handed to the worker
  // coexist briefly, so budget for both.
  if (decoded * ANALYSIS_COPY_FACTOR > base.maxDecodedBytes) {
    return { ...base, reason: 'too-large' };
  }

  if (durationSeconds > base.maxDurationSeconds) {
    return { ...base, reason: 'too-large' };
  }

  return base;
}
