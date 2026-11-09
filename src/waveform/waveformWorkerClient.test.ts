import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyze } from './waveformWorkerClient';

/**
 * Regression guard for the MessagePort handshake.
 *
 * A MessagePort only delivers queued messages once it is started. The client
 * used to register `addEventListener('message')` without calling `start()`,
 * so every worker reply was silently dropped and the waveform stayed in its
 * "Preparing…" state forever. The fakes below model that behaviour: a port
 * that was never started discards messages.
 */

class FakePort {
  peer: FakePort | null = null;
  started = false;
  closed = false;
  listeners: Array<(event: MessageEvent) => void> = [];
  start = vi.fn((): void => {
    this.started = true;
  });

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (type === 'message') {
      this.listeners.push(listener);
    }
  }

  close = vi.fn((): void => {
    this.closed = true;
  });

  postMessage(data: unknown): void {
    this.peer?.deliver(data);
  }

  deliver(data: unknown): void {
    if (!this.started) {
      return;
    }
    for (const listener of this.listeners) {
      listener({ data } as MessageEvent);
    }
  }
}

class FakeMessageChannel {
  static instances: FakeMessageChannel[] = [];

  port1 = new FakePort();
  port2 = new FakePort();

  constructor() {
    this.port1.peer = this.port2;
    this.port2.peer = this.port1;
    FakeMessageChannel.instances.push(this);
  }
}

function lastChannel(): FakeMessageChannel {
  const channel = FakeMessageChannel.instances.at(-1);
  if (!channel) {
    throw new Error('No channel was created');
  }
  return channel;
}

class FakeWorker {
  static instances: FakeWorker[] = [];

  terminated = false;
  received: Array<Record<string, unknown>> = [];
  listeners = new Map<string, Array<(event: Event) => void>>();

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  postMessage(message: Record<string, unknown>): void {
    this.received.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Simulate the worker replying on the transferred port. */
  reply(data: unknown): void {
    const port = this.received[0]?.port as FakePort | undefined;
    port?.postMessage(data);
  }

  emit(type: string, event: Event = new Event(type)): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function lastWorker(): FakeWorker {
  const worker = FakeWorker.instances.at(-1);
  if (!worker) {
    throw new Error('No worker was created');
  }
  return worker;
}

describe('waveformWorkerClient', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    FakeMessageChannel.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('MessageChannel', FakeMessageChannel);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts the reply port so worker results are delivered', async () => {
    const { promise } = analyze({
      type: 'analyze-wav',
      requestId: 'waveform-1',
      fileGeneration: 1,
      buffer: new ArrayBuffer(64),
      bucketCount: 120,
    });

    const worker = lastWorker();
    const replyPort = lastChannel().port1;
    const transferredPort = worker.received[0]?.port as FakePort;

    expect(transferredPort).toBe(lastChannel().port2);
    expect(replyPort.start).toHaveBeenCalledTimes(1);

    worker.reply({
      type: 'success',
      requestId: 'waveform-1',
      fileGeneration: 1,
      durationSeconds: 2,
      sampleRate: 44_100,
      channelCount: 2,
      bucketCount: 4,
      peaks: new Float32Array([0, 0.5, 1, 0.25]),
    });

    await expect(promise).resolves.toMatchObject({ type: 'success', durationSeconds: 2 });
    expect(worker.terminated).toBe(true);
    expect(replyPort.closed).toBe(true);
  });

  it('reports worker failures and terminates the worker', async () => {
    const { promise } = analyze({
      type: 'extract-peaks',
      requestId: 'waveform-2',
      fileGeneration: 3,
      channels: [new Float32Array(8)],
      sampleRate: 44_100,
      durationSeconds: 1,
      bucketCount: 120,
    });

    const worker = lastWorker();

    worker.reply({
      type: 'failure',
      requestId: 'waveform-2',
      fileGeneration: 3,
      reason: 'unsupported',
    });

    await expect(promise).resolves.toMatchObject({ type: 'failure', reason: 'unsupported' });
    expect(worker.terminated).toBe(true);
  });

  it('terminates the worker and settles as cancelled', async () => {
    const { promise, cancel } = analyze({
      type: 'analyze-wav',
      requestId: 'waveform-3',
      fileGeneration: 4,
      buffer: new ArrayBuffer(64),
      bucketCount: 120,
    });

    const worker = lastWorker();
    cancel();

    await expect(promise).resolves.toMatchObject({ type: 'failure', reason: 'cancelled' });
    expect(worker.terminated).toBe(true);
  });

  it('settles as internal when the worker itself errors', async () => {
    const { promise } = analyze({
      type: 'analyze-wav',
      requestId: 'waveform-4',
      fileGeneration: 5,
      buffer: new ArrayBuffer(64),
      bucketCount: 120,
    });

    const worker = lastWorker();
    worker.emit('error');

    await expect(promise).resolves.toMatchObject({ type: 'failure', reason: 'internal' });
    expect(worker.terminated).toBe(true);
  });
});
