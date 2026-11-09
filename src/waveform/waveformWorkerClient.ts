/**
 * Main-thread client for the waveform worker.
 *
 * Each analysis gets its own short-lived Dedicated Worker. That costs one
 * worker start per file, but it makes cancellation real: terminating the
 * worker stops a CPU-bound WAV scan immediately instead of waiting for a
 * message that a busy worker cannot process. Isolating requests also means one
 * slot cancelling or failing can never strand the other slot's analysis.
 *
 * Requests carry a `requestId` and the source slot's `fileGeneration`; stale
 * results (superseded by a replace/remove/dispose) are ignored. Peak data comes
 * back as a transferable ArrayBuffer so the encoded file buffer never lingers.
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

type CancelRequest = {
  type: 'cancel';
  requestId: string;
  fileGeneration: number;
};

let nextRequestId = 0;

function nextId(): string {
  return `waveform-${++nextRequestId}`;
}

/** Create one worker for one request. Returns null when workers are unavailable. */
function createWorker(): Worker | null {
  try {
    // Vite worker module: a separate, type-checked bundle.
    return new Worker(new URL('./waveformWorker.ts', import.meta.url), {
      type: 'module',
    });
  } catch {
    return null;
  }
}

/**
 * Send one analysis request to a fresh worker. The caller receives a promise
 * that resolves with peaks or a failure reason, plus a `cancel` function that
 * terminates the worker and settles the promise as cancelled.
 */
function analyze(input: AnalyzeInput): {
  promise: Promise<ClientSuccess | ClientFailure>;
  cancel: () => void;
} {
  const channel = new MessageChannel();
  const port = channel.port1;
  const workerPort = channel.port2;

  const fullRequest = { ...input, port: workerPort } as AnalyzeInput & { port: MessagePort };

  let resolve!: (value: ClientSuccess | ClientFailure) => void;
  const promise = new Promise<ClientSuccess | ClientFailure>((res) => {
    resolve = res;
  });

  const worker = createWorker();
  let settled = false;

  const finish = (value: ClientSuccess | ClientFailure): void => {
    if (settled) {
      return;
    }
    settled = true;

    try {
      port.close();
    } catch {
      // Port may already be closed.
    }

    if (worker) {
      try {
        worker.terminate();
      } catch {
        // Worker may already be gone.
      }
    }

    resolve(value);
  };

  if (!worker) {
    // Close the unused channel before settling.
    try {
      workerPort.close();
    } catch {
      // ignore
    }
    finish({
      type: 'failure',
      requestId: fullRequest.requestId,
      fileGeneration: fullRequest.fileGeneration,
      reason: 'internal',
    });
    return { promise, cancel: () => undefined };
  }

  worker.addEventListener('error', () => {
    finish({
      type: 'failure',
      requestId: fullRequest.requestId,
      fileGeneration: fullRequest.fileGeneration,
      reason: 'internal',
    });
  });

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

  // A MessagePort only starts delivering messages when it is explicitly
  // started or its `onmessage` handler is assigned. `addEventListener` alone
  // leaves the queue paused, which would strand every analysis result.
  port.start();

  const transfer: Transferable[] = [fullRequest.port];

  if (fullRequest.type === 'analyze-wav') {
    transfer.push(fullRequest.buffer);
  } else {
    // Decoded channel buffers are transferred rather than cloned, so the
    // worker owns the only copy while it reduces them.
    for (const channelData of fullRequest.channels) {
      transfer.push(channelData.buffer as ArrayBuffer);
    }
  }

  try {
    worker.postMessage(fullRequest, transfer);
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
    if (settled) {
      return;
    }

    // The worker may be mid-scan and unable to read a cancel message. Killing
    // it is the only reliable way to stop the CPU work.
    try {
      worker.postMessage({
        type: 'cancel',
        requestId: fullRequest.requestId,
        fileGeneration: fullRequest.fileGeneration,
      } as CancelRequest);
    } catch {
      // Worker may already be gone.
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
