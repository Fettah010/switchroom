/**
 * Dedicated Worker for CPU-heavy waveform analysis.
 *
 * Responsibilities:
 *  - Parse PCM WAV files directly from an ArrayBuffer (no browser decoder
 *    required) and reduce them to bounded peak buckets in one pass.
 *  - Reduce already-decoded PCM channels (non-WAV formats) into the same
 *    bounded peak representation.
 *  - Return compact, transferable peak data; never return raw PCM.
 *
 * The main thread owns AudioContext/decodeAudioData for non-WAV codecs and
 * only ships already-decoded Float32 channels here for reduction. The client
 * terminates this worker to cancel CPU-bound work, so the scan does not need
 * to be interruptible mid-bucket.
 */

import { extractPeaksFromChannels } from './peakExtraction';
import { extractWavPeaks } from './wavParser';

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
  /** Sent as a typed array so the main thread receives a usable view. */
  peaks: Float32Array;
};

type WaveformFailure = {
  type: 'failure';
  requestId: string;
  fileGeneration: number;
  reason: 'unsupported' | 'decode-failed' | 'cancelled' | 'internal';
};

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
    peaks,
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

  // A new request supersedes any in-flight analysis.
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
      const outcome = extractWavPeaks(message.buffer, message.bucketCount, {
        shouldAbort: () => abort,
      });

      if (abort) {
        return;
      }

      if (!outcome.ok) {
        postFailure(port, message, outcome.reason === 'cancelled' ? 'cancelled' : 'unsupported');
        return;
      }

      const { peaks, format } = outcome.result;

      postSuccess(
        port,
        message,
        format.durationSeconds,
        format.sampleRate,
        format.channelCount,
        peaks,
      );
    } else if (message.type === 'extract-peaks') {
      const peaks = extractPeaksFromChannels(message.channels, message.bucketCount);

      if (abort) {
        return;
      }

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
