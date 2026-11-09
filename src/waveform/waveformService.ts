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
 *   fallback     - analysis intentionally skipped (size/memory/duration);
 *                  normal timeline seeking remains available
 *   unavailable  - analysis failed (unsupported codec, decode error, internal);
 *                  playback may still work
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
import { parseWavFormat } from './wavParser';

const SUPPORTED_WAVEFORM_EXTENSIONS = new Set(['wav', 'mp3', 'flac', 'aac', 'm4a']);

/** Enough header bytes for RIFF, fmt and the start of a data chunk. */
const WAV_HEADER_BYTES = 64 * 1024;

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

/** Read a File or Blob as an ArrayBuffer. */
function readBuffer(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as unknown as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.onabort = () => reject(new Error('File read aborted'));
    reader.readAsArrayBuffer(file);
  });
}

/** Read only the leading bytes of a File or Blob slice. */
function readHeader(file: Blob, byteLength: number): Promise<ArrayBuffer> {
  return readBuffer(file.slice(0, Math.min(byteLength, file.size)));
}

/** Optional dependency: decode an encoded buffer to PCM channels. */
export interface WaveformDecoder {
  decodeAudioData(buffer: ArrayBuffer): Promise<AudioBufferLike>;
}

export interface AudioBufferLike {
  readonly duration: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  /** Sample frames per channel, when the host exposes it. */
  readonly length?: number;
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
        length: audioBuffer.length,
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
  'too-large': 'Waveform preview skipped for this large file. Playback and seeking still work.',
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
    this.fileGeneration += 1;

    if (!file) {
      this.setView(emptyView(this.version));
      return;
    }

    const extension = getExtension(file.name);
    const generation = this.fileGeneration;
    const requestId = nextId();
    this.currentRequestId = requestId;

    this.setView({
      state: 'preparing',
      peaks: null,
      fileName: file.name,
      durationSeconds: null,
      message: 'Preparing waveform…',
    });

    // A format the analyzer cannot handle is an honest "unavailable" state,
    // not a silent fallback: playback still works, but there is no preview.
    if (!isWaveformExtension(extension)) {
      this.fail(requestId, 'unsupported');
      return;
    }

    // Cheap synchronous guard before reading anything. Compressed formats use
    // the tighter source ceiling here because their duration is unknown.
    const initialBudget = selectBudget(file.size, null, null, null, extension);

    if (initialBudget.reason === 'too-large') {
      this.skip(requestId, 'too-large');
      return;
    }

    this.startAnalysis(file, extension, generation, requestId, initialBudget);
  }

  private startAnalysis(
    file: File,
    extension: string | null,
    generation: number,
    requestId: string,
    initialBudget: WaveformBudget,
  ): void {
    const isWav = extension === 'wav';

    const isCurrent = (): boolean =>
      !this.disposed && this.currentRequestId === requestId && this.fileGeneration === generation;

    const run = async (): Promise<void> => {
      if (!isCurrent()) {
        return;
      }

      try {
        if (isWav) {
          // Read only the header first: a long WAV can be rejected without
          // pulling the entire file into memory.
          let budget = initialBudget;

          try {
            const header = await readHeader(file, WAV_HEADER_BYTES);

            if (!isCurrent()) {
              return;
            }

            const parsed = parseWavFormat(header, { headerOnly: true });

            if (parsed.ok) {
              budget = selectBudget(
                file.size,
                parsed.format.durationSeconds,
                parsed.format.sampleRate,
                parsed.format.channelCount,
                extension,
              );

              if (budget.reason === 'too-large') {
                this.skip(requestId, 'too-large');
                return;
              }
            }
          } catch {
            // Header preflight is an optimisation only; fall through to the
            // size-based budget and let the worker decide.
          }

          const buffer = await readBuffer(file);

          if (!isCurrent()) {
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
          return;
        }

        // Non-WAV: browser decode on the main thread, then peak reduction in
        // the worker so the expensive iteration stays off the render path.
        let decoded: AudioBufferLike;

        try {
          decoded = await this.decoder.decodeAudioData(await readBuffer(file));
        } catch {
          if (isCurrent()) {
            this.fail(requestId, 'decode-failed');
          }
          return;
        }

        if (!isCurrent()) {
          return;
        }

        const decodedBudget = selectBudget(
          file.size,
          decoded.duration,
          decoded.sampleRate,
          decoded.numberOfChannels,
          extension,
        );

        if (decodedBudget.reason === 'too-large') {
          this.skip(requestId, 'too-large');
          return;
        }

        const frameCount = decoded.length ?? Math.floor(decoded.duration * decoded.sampleRate);
        const channels: Float32Array[] = [];

        for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
          const data = new Float32Array(frameCount);
          decoded.copyToChannel(data, channel);
          channels.push(data);
        }

        if (!isCurrent()) {
          channels.length = 0;
          return;
        }

        const { promise, cancel } = analyze({
          type: 'extract-peaks',
          requestId,
          fileGeneration: generation,
          channels,
          sampleRate: decoded.sampleRate,
          durationSeconds: decoded.duration,
          bucketCount: decodedBudget.maxBucketCount,
        });

        // The client transfers the channel buffers to the worker; drop our
        // references immediately so the main thread does not pin them.
        channels.length = 0;

        this.cancelCurrent = cancel;
        const result = await promise;
        this.cancelCurrent = null;
        this.handleResult(requestId, generation, result);
      } catch {
        if (isCurrent()) {
          this.fail(requestId, 'internal');
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

    if (result.type === 'success') {
      this.currentRequestId = null;
      this.cancelCurrent = null;

      const peaks: WaveformPeaks = {
        version: this.version,
        durationSeconds: result.durationSeconds,
        bucketCount: result.bucketCount,
        peaks: result.peaks,
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

    // Cancellation means the file was replaced or removed; the new view is
    // already in place, so there is nothing to report.
    if (result.reason === 'cancelled') {
      return;
    }

    if (result.reason === 'too-large') {
      this.skip(requestId, 'too-large');
      return;
    }

    this.fail(requestId, result.reason);
  }

  /** Analysis was intentionally skipped; playback remains available. */
  private skip(requestId: string, reason: WaveformFailureReason): void {
    if (this.disposed || this.currentRequestId !== requestId) {
      return;
    }

    this.currentRequestId = null;
    this.cancelCurrent = null;

    this.setView({
      state: 'fallback',
      peaks: null,
      durationSeconds: null,
      message: failureMessages[reason],
    });
  }

  /** Analysis failed; playback remains available but there is no preview. */
  private fail(requestId: string, reason: WaveformFailureReason): void {
    if (this.disposed || this.currentRequestId !== requestId) {
      return;
    }

    this.currentRequestId = null;
    this.cancelCurrent = null;

    this.setView({
      state: 'unavailable',
      peaks: null,
      durationSeconds: null,
      message: failureMessages[reason],
    });
  }

  dispose(): void {
    this.disposed = true;
    this.cancelCurrent?.();
    this.cancelCurrent = null;
    this.currentRequestId = null;
    this.listeners.clear();
  }
}
