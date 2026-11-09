/**
 * Waveform subsystem types.
 *
 * The waveform lives outside the playback engine: `ABAudioEngine` owns the
 * canonical playhead and audio state; this subsystem only derives compact,
 * downsampled amplitude peaks from a local `File` for visual preview.
 *
 * Peak data never leaves the browser and is never persisted.
 */

export type WaveformState = 'waiting' | 'preparing' | 'ready' | 'fallback' | 'unavailable';

export type WaveformFailureReason =
  'unsupported' | 'too-large' | 'decode-failed' | 'cancelled' | 'internal';

/**
 * Compact peak representation derived from a decoded audio file.
 *
 * `peaks` holds one magnitude per time bucket, normalized to [0, 1] using the
 * maximum absolute channel amplitude (mono envelope). Buckets are equal-width
 * slices of the file's duration so each bucket maps to a fraction of the
 * shared/common timeline.
 */
export interface WaveformPeaks {
  version: 'original' | 'edited';
  durationSeconds: number;
  bucketCount: number;
  peaks: Float32Array;
  /** Increments whenever the source file is replaced or removed. */
  sourceGeneration: number;
}

/**
 * Snapshot of one slot's waveform lifecycle, consumed by React components.
 */
export interface WaveformSlotView {
  version: 'original' | 'edited';
  state: WaveformState;
  peaks: WaveformPeaks | null;
  fileName: string | null;
  durationSeconds: number | null;
  message: string | null;
}

/**
 * Public service contract. One instance per audio slot, created by the
 * workspace when both file slots exist.
 */
export interface WaveformService {
  readonly version: 'original' | 'edited';
  readonly view: WaveformSlotView;
  subscribe(listener: () => void): () => void;
  /** Call when the engine reports a new file for this slot. */
  loadFile(file: File | null): void;
  /** Buckets to request for a given CSS width and device pixel ratio. */
  requestedBucketCount(containerWidth: number, devicePixelRatio: number): number;
  dispose(): void;
}
