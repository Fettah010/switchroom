import type { WaveformSlotView } from '../../waveform/waveformTypes';

/**
 * Fraction of a slot's peaks that falls inside the shared common duration.
 *
 * The comparison axis spans the shorter of the two files. A longer file is
 * clipped to that window and stretched across the plot, so its waveform
 * features stay aligned with the one shared playhead instead of running past
 * the end of the comparison.
 */
export function sharedFraction(view: WaveformSlotView, commonDuration: number): number {
  const peakDuration = view.peaks?.durationSeconds ?? view.durationSeconds;

  if (
    peakDuration === null ||
    peakDuration <= 0 ||
    !Number.isFinite(peakDuration) ||
    !Number.isFinite(commonDuration) ||
    commonDuration <= 0
  ) {
    return 1;
  }

  return Math.min(1, commonDuration / peakDuration);
}
