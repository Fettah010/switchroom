/**
 * Per-slot waveform lifecycle service.
 *
 * Independent of `ABAudioEngine`: it subscribes to file lifecycle information
 * (the local `File`) and derives compact downsampled peaks for visual preview.
 * It never owns the playhead, never decodes audio for playback, and never
 * touches the Web Audio playback graph.
 *
 * Lifecycle states per slot:
 *   waiting      - no file selected
 *   preparing    - file loaded for playback; waveform analysis pending
 *   ready        - real peaks generated and ready to draw
 *   fallback     - analysis intentionally skipped (size/memory/capability);
 *                  normal timeline seeking remains available
 *   unavailable  - analysis failed; playback may still work
 *
 * Every request carries a `requestId` and the slot's `fileGeneration`. Stale
 * results (a file replaced or removed mid-analysis) are ignored.
 */

import type {
  WaveformFailureReason,
  WaveformPeaks,
  WaveformService,
  WaveformSlotView,
} from './waveformTypes';
import { analyze, nextId } from './waveformWorkerClient';
import { selectBudget, type WaveformBudget } from './waveformBudget';

const SUPPORTED_WAVEFORM_EXTENSIONS = new Set(['wav', 'mp3', 'flac', 'aac', 'm4a']);

function getExtension(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) {
    return null;
  }
  return fileName.slice(dot + 1).toLowerCase();
}

function isWaveformExtension(extension: string | null): boolean {
  return extension !== null && SUPPORTED_WAVEFORM_EXTENSIONS.has(extension);
}

/** Read a File as an ArrayBuffer. */
function readBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as unknown as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.onabort = () => reject(new Error('File read aborted'));
    reader.readAsArrayBuffer(file);
  });
}

/** Optional dependency: decode an encoded buffer to PCM channels. */
export interface WaveformDecoder {
  decodeAudioData(buffer: ArrayBuffer): Promise<AudioBufferLike>;
}

export interface AudioBufferLike {
  readonly duration: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  copyToChannel(destination: Float32Array<ArrayBuffer>, channelNumber: number): void;
}

const browserDecoder: WaveformDecoder = {
  async decodeAudioData(buffer: ArrayBuffer): Promise<AudioBufferLike> {
    const AudioContextConstructor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextConstructor) {
      throw new Error('Web Audio is not available');
    }

    const context = new AudioContextConstructor();
    try {
      const audioBuffer = await context.decodeAudioData(buffer);
      return {
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        numberOfChannels: audioBuffer.numberOfChannels,
        copyToChannel: (destination: Float32Array<ArrayBuffer>, channelNumber: number) => {
          audioBuffer.copyToChannel(destination, channelNumber);
        },
      };
    } finally {
      if (context.state !== 'closed') {
        void context.close().catch(() => undefined);
      }
    }
  },
};

function emptyView(version: 'original' | 'edited'): WaveformSlotView {
  return {
    version,
    state: 'waiting',
    peaks: null,
    fileName: null,
    durationSeconds: null,
    message: null,
  };
}

const failureMessages: Record<WaveformFailureReason, string> = {
  unsupported:
    'Waveform preview is unavailable for this format in this browser. Playback may still work.',
  'too-large': 'Waveform preview skipped for this file. Playback and seeking still work.',
  'decode-failed': 'Could not create this waveform. You can still compare the audio.',
  cancelled: 'Waveform preview cancelled.',
  internal: 'Could not create this waveform. You can still compare the audio.',
};

export class WaveformServiceImpl implements WaveformService {
  readonly version: 'original' | 'edited';
  view: WaveformSlotView;
  private decoder: WaveformDecoder;
  private listeners = new Set<() => void>();
  private fileGeneration = 0;
  private currentRequestId: string | null = null;
  private cancelCurrent: (() => void) | null = null;
  private disposed = false;

  constructor({ version, decoder }: { version: 'original' | 'edited'; decoder?: WaveformDecoder }) {
    this.version = version;
    this.decoder = decoder ?? browserDecoder;
    this.view = emptyView(version);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  private setView(partial: Partial<WaveformSlotView>): void {
    this.view = { ...this.view, ...partial };
    this.notify();
  }

  /** Buckets to request for a given CSS width and device pixel ratio. */
  requestedBucketCount(containerWidth: number, devicePixelRatio: number): number {
    const density = Math.max(1, Math.trunc(devicePixelRatio) || 1);
    const target = Math.max(1200, Math.trunc(containerWidth * density));
    return Math.min(2400, Math.max(64, target));
  }

  /** Call when the engine reports a new file (or null) for this slot. */
  loadFile(file: File | null): void {
    if (this.disposed) {
      return;
    }

    this.cancelCurrent?.();
    this.currentRequestId = null;
    this.cancelCurrent = null;

    if (!file) {
      this.setView({
        ...emptyView(this.version),
        state: 'waiting',
      });
      this.fileGeneration += 1;
      return;
    }

    const extension = getExtension(file.name);
    const generation = (this.fileGeneration += 1);
    const requestId = nextId();
    this.currentRequestId = requestId;

    this.setView({
      state: 'preparing',
      peaks: null,
      fileName: file.name,
      durationSeconds: null,
      message: 'Preparing waveform…',
    });

    // If analysis is not possible for this extension, fall back without
    // attempting decode.
    if (!isWaveformExtension(extension)) {
      this.finish(requestId, 'unsupported', true);
      return;
    }

    const budget = selectBudget(file.size, null, null, null);

    if (budget.reason === 'too-large') {
      this.finish(requestId, 'too-large', true);
      return;
    }

    this.startAnalysis(file, generation, requestId, budget);
  }

  private startAnalysis(
    file: File,
    generation: number,
    requestId: string,
    budget: WaveformBudget,
  ): void {
    const extension = getExtension(file.name);
    const isWav = extension === 'wav';

    const run = async (): Promise<void> => {
      // Guard: the slot may have been replaced/removed while we awaited.
      if (
        this.disposed ||
        this.currentRequestId !== requestId ||
        this.fileGeneration !== generation
      ) {
        return;
      }

      try {
        if (isWav) {
          const buffer = await readBuffer(file);

          if (
            this.disposed ||
            this.currentRequestId !== requestId ||
            this.fileGeneration !== generation
          ) {
            return;
          }

          const { promise, cancel } = analyze({
            type: 'analyze-wav',
            requestId,
            fileGeneration: generation,
            buffer,
            bucketCount: budget.maxBucketCount,
          });

          this.cancelCurrent = cancel;
          const result = await promise;
          this.cancelCurrent = null;
          this.handleResult(requestId, generation, result);
        } else {
          // Non-WAV: browser decode on the main thread, then peak reduction
          // in the worker so the expensive iteration stays off the render path.
          let duration = 0;
          let sampleRate = 0;
          let channelCount = 0;
          let channels: Float32Array[] = [];

          try {
            const audioBuffer = await this.decoder.decodeAudioData(await readBuffer(file));

            duration = audioBuffer.duration;
            sampleRate = audioBuffer.sampleRate;
            channelCount = audioBuffer.numberOfChannels;

            channels = [];
            for (let c = 0; c < channelCount; c += 1) {
              const channel = new Float32Array(
                Math.floor(audioBuffer.duration * audioBuffer.sampleRate),
              );
              audioBuffer.copyToChannel(channel, c);
              channels.push(channel);
            }
          } catch {
            if (
              this.disposed ||
              this.currentRequestId !== requestId ||
              this.fileGeneration !== generation
            ) {
              return;
            }
            this.finish(requestId, 'decode-failed', false);
            return;
          }

          if (
            this.disposed ||
            this.currentRequestId !== requestId ||
            this.fileGeneration !== generation
          ) {
            return;
          }

          // Re-check the decoded-memory budget now that duration is known.
          const decodedBudget = selectBudget(file.size, duration, sampleRate, channelCount);
          if (decodedBudget.reason === 'too-large') {
            this.finish(requestId, 'too-large', true);
            return;
          }

          const { promise, cancel } = analyze({
            type: 'extract-peaks',
            requestId,
            fileGeneration: generation,
            channels,
            sampleRate,
            durationSeconds: duration,
            bucketCount: decodedBudget.maxBucketCount,
          });

          this.cancelCurrent = cancel;
          const result = await promise;
          this.cancelCurrent = null;
          this.handleResult(requestId, generation, result);
        }
      } catch {
        if (
          !this.disposed &&
          this.currentRequestId === requestId &&
          this.fileGeneration === generation
        ) {
          this.finish(requestId, 'internal', false);
        }
      }
    };

    void run();
  }

  private handleResult(
    requestId: string,
    generation: number,
    result:
      | { type: 'success'; durationSeconds: number; bucketCount: number; peaks: Float32Array }
      | { type: 'failure'; reason: WaveformFailureReason },
  ): void {
    if (this.disposed) {
      return;
    }

    // Ignore stale results from superseded requests/files.
    if (this.currentRequestId !== requestId || this.fileGeneration !== generation) {
      return;
    }

    this.cancelCurrent = null;
    this.currentRequestId = null;

    if (result.type === 'success') {
      const peaks: WaveformPeaks = {
        version: this.version,
        durationSeconds: result.durationSeconds,
        bucketCount: result.bucketCount,
        peaks: result.peaks.slice() as Float32Array,
        sourceGeneration: generation,
      };

      this.setView({
        state: 'ready',
        peaks,
        durationSeconds: peaks.durationSeconds,
        message: null,
      });
      return;
    }

    this.finish(requestId, result.reason, false);
  }

  private finish(
    requestId: string,
    reason: WaveformFailureReason | null,
    isFallback: boolean,
  ): void {
    if (this.disposed) {
      return;
    }

    if (this.currentRequestId !== requestId && !isFallback) {
      // Stale cancellation/failure: silently discard.
      return;
    }

    if (isFallback) {
      this.setView({
        state: 'fallback',
        peaks: null,
        durationSeconds: null,
        message: null,
      });
    } else {
      this.setView({
        state: 'unavailable',
        peaks: null,
        durationSeconds: null,
        message: reason ? failureMessages[reason] : null,
      });
    }
  }

  dispose(): void {
    this.disposed = true;
    this.cancelCurrent?.();
    this.cancelCurrent = null;
    this.currentRequestId = null;
    this.listeners.clear();
  }
}
