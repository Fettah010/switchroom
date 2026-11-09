/**
 * Main-thread client for the waveform worker.
 *
 * Owns one Dedicated Worker and one MessageChannel port per request. Requests
 * carry a `requestId` and the source slot's `fileGeneration`; stale results
 * (superseded by a replace/remove/dispose) are ignored. Peak data comes back
 * as a transferable ArrayBuffer so the encoded file buffer never lingers.
 */

import type { WaveformFailureReason } from './waveformTypes';

type AnalyzeInput =
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

type ClientSuccess = {
  type: 'success';
  requestId: string;
  fileGeneration: number;
  durationSeconds: number;
  sampleRate: number;
  channelCount: number;
  bucketCount: number;
  peaks: Float32Array;
};

type ClientFailure = {
  type: 'failure';
  requestId: string;
  fileGeneration: number;
  reason: WaveformFailureReason;
};

let worker: Worker | null = null;
let workerError = false;

/** Lazily create the worker. Returns null when workers are unavailable. */
function getWorker(): Worker | null {
  if (workerError) {
    return null;
  }

  if (worker) {
    return worker;
  }

  try {
    // Vite worker module: a separate, type-checked bundle.
    worker = new Worker(new URL('./waveformWorker.ts', import.meta.url), {
      type: 'module',
    });

    worker.addEventListener('error', () => {
      workerError = true;
      worker = null;
    });

    return worker;
  } catch {
    workerError = true;
    return null;
  }
}

type CancelRequest = {
  type: 'cancel';
  requestId: string;
  fileGeneration: number;
};

let nextRequestId = 0;

function nextId(): string {
  return `waveform-${++nextRequestId}`;
}

/**
 * Send one analysis request over a fresh MessageChannel port. The caller
 * receives a promise that resolves with peaks or a failure reason, plus a
 * `cancel` function that tells the worker to drop the in-flight request.
 */
function analyze(input: AnalyzeInput): {
  promise: Promise<ClientSuccess | ClientFailure>;
  cancel: () => void;
} {
  const channel = new MessageChannel();
  const port = channel.port1;
  const workerPort = channel.port2;

  const fullRequest = { ...input, port: workerPort } as {
    type: 'analyze-wav' | 'extract-peaks';
    requestId: string;
    fileGeneration: number;
    buffer?: ArrayBuffer;
    bucketCount?: number;
    channels?: Float32Array[];
    sampleRate?: number;
    durationSeconds?: number;
    port: MessagePort;
  };

  let resolve!: (value: ClientSuccess | ClientFailure) => void;
  const promise = new Promise<ClientSuccess | ClientFailure>((res) => {
    resolve = res;
  });

  let settled = false;

  const finish = (value: ClientSuccess | ClientFailure): void => {
    if (settled) {
      return;
    }
    settled = true;
    try {
      port.close();
    } catch {
      // port may already be closed
    }
    resolve(value);
  };

  port.addEventListener('message', (event: MessageEvent<ClientSuccess | ClientFailure>) => {
    finish(event.data);
  });

  port.addEventListener('messageerror', () => {
    finish({
      type: 'failure',
      requestId: fullRequest.requestId,
      fileGeneration: fullRequest.fileGeneration,
      reason: 'internal',
    });
  });

  const w = getWorker();

  if (!w) {
    finish({
      type: 'failure',
      requestId: fullRequest.requestId,
      fileGeneration: fullRequest.fileGeneration,
      reason: 'internal',
    });
    return { promise, cancel: () => undefined };
  }

  const transfer: (ArrayBuffer | MessagePort)[] = [];
  if (fullRequest.type === 'analyze-wav' && fullRequest.buffer) {
    transfer.push(fullRequest.buffer);
  }
  // The reply port is transferred to the worker.
  transfer.push(fullRequest.port);

  try {
    w.postMessage(fullRequest, transfer);
  } catch {
    finish({
      type: 'failure',
      requestId: fullRequest.requestId,
      fileGeneration: fullRequest.fileGeneration,
      reason: 'internal',
    });
    return { promise, cancel: () => undefined };
  }

  const cancel = (): void => {
    try {
      w.postMessage({
        type: 'cancel',
        requestId: fullRequest.requestId,
        fileGeneration: fullRequest.fileGeneration,
      } as CancelRequest);
    } catch {
      // worker may be gone
    }
    finish({
      type: 'failure',
      requestId: fullRequest.requestId,
      fileGeneration: fullRequest.fileGeneration,
      reason: 'cancelled',
    });
  };

  return { promise, cancel };
}

export { analyze, nextId };
