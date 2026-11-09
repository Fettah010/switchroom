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
 */

export interface WaveformBudget {
  maxSourceBytes: number;
  maxDecodedBytes: number;
  maxBucketCount: number;
  reason: 'ok' | 'too-large' | 'unknown-duration' | 'low-memory';
}

/** Default limits, measured against a typical desktop machine. */
export const DEFAULT_BUDGET: WaveformBudget = {
  maxSourceBytes: 60 * 1024 * 1024, // 60 MB encoded input
  maxDecodedBytes: 240 * 1024 * 1024, // 240 MB decoded PCM ceiling
  maxBucketCount: 2400,
  reason: 'ok',
};

/** Conservative limits for constrained/memory-constrained devices. */
export const LOW_MEMORY_BUDGET: WaveformBudget = {
  maxSourceBytes: 20 * 1024 * 1024, // 20 MB encoded input
  maxDecodedBytes: 60 * 1024 * 1024, // 60 MB decoded PCM ceiling
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

/** Pick the budget based on device memory hints and file characteristics. */
export function selectBudget(
  fileSizeBytes: number,
  durationSeconds: number | null,
  sampleRate: number | null,
  channelCount: number | null,
): WaveformBudget {
  const deviceMemory = (navigator as { deviceMemory?: number }).deviceMemory;

  const isLowMemory =
    typeof deviceMemory === 'number' && Number.isFinite(deviceMemory) && deviceMemory <= 4;

  const base = isLowMemory ? LOW_MEMORY_BUDGET : DEFAULT_BUDGET;

  // Encoded input larger than the source ceiling cannot be analysed safely.
  if (fileSizeBytes > base.maxSourceBytes) {
    return { ...base, reason: 'too-large' };
  }

  const decoded = estimateDecodedBytes(durationSeconds, sampleRate, channelCount);

  // Unknown duration: use a conservative per-MB heuristic so a huge file with
  // missing metadata still falls back rather than risking unbounded decode.
  if (decoded === null) {
    const estimatedFromSize = fileSizeBytes * 8; // rough worst-case PCM expansion
    if (estimatedFromSize > base.maxDecodedBytes) {
      return { ...base, reason: 'too-large' };
    }
    return { ...base, reason: 'unknown-duration' };
  }

  if (decoded > base.maxDecodedBytes) {
    return { ...base, reason: 'too-large' };
  }

  return base;
}
