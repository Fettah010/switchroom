/**
 * Pure peak downsampling for waveform previews.
 *
 * Splits a decoded PCM signal into a bounded number of equal-duration buckets
 * and reports the maximum absolute amplitude per bucket (mono envelope).
 * All values are finite and clamped to [0, 1]. The same input and
 * configuration always produce the same output.
 */

/** Maximum number of display buckets regardless of source length. */
export const MAX_BUCKET_COUNT = 2400;

/** Minimum useful bucket count. */
export const MIN_BUCKET_COUNT = 1;

/**
 * Extract one peak magnitude per bucket from interleaved PCM data.
 *
 * @param samples - Float32 PCM samples in [-1, 1], interleaved across channels.
 * @param channelCount - Number of channels (1 for mono, 2 for stereo).
 * @param bucketCount - Bounded bucket count, clamped to [MIN_BUCKET_COUNT, MAX_BUCKET_COUNT].
 * @returns A Float32Array of length `bucketCount` with values in [0, 1].
 */
export function extractPeaks(
  samples: Float32Array,
  channelCount: number,
  bucketCount: number,
): Float32Array {
  const clamped = Math.min(MAX_BUCKET_COUNT, Math.max(MIN_BUCKET_COUNT, Math.trunc(bucketCount)));
  const peaks = new Float32Array(clamped);
  const sampleCount = samples.length;

  if (sampleCount === 0 || channelCount < 1 || clamped < 1) {
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
        const magnitude = Number.isFinite(value) ? Math.abs(value) : 0;
        if (magnitude > maxAbs) {
          maxAbs = magnitude;
        }
      }
    }

    peaks[bucket] = maxAbs > 1 ? 1 : maxAbs;
  }

  return peaks;
}

/**
 * Extract peaks from per-channel planar PCM arrays by taking the maximum
 * absolute amplitude across channels at each sample index.
 */
export function extractPeaksFromChannels(
  channels: Float32Array[],
  bucketCount: number,
): Float32Array {
  const clamped = Math.min(MAX_BUCKET_COUNT, Math.max(MIN_BUCKET_COUNT, Math.trunc(bucketCount)));
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
