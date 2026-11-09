import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WaveformServiceImpl } from './waveformService';

type AnalyzeResult = {
  promise: Promise<unknown>;
  cancel: () => void;
};

const resolvers: Array<(value: unknown) => void> = [];
const mockAnalyze = vi.fn((_input: unknown): AnalyzeResult => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((resolveInner) => {
    resolve = resolveInner;
  });
  resolvers.push(resolve);
  return { promise, cancel: () => undefined };
});

vi.mock('./waveformWorkerClient', () => ({
  analyze: (input: unknown) => mockAnalyze(input),
  nextId: () => 'waveform-1',
}));

function makeFile(name: string): File {
  return new File(['hello'], name, { type: 'audio/wav' });
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function successResult(durationSeconds = 2): {
  type: 'success';
  durationSeconds: number;
  bucketCount: number;
  peaks: Float32Array;
} {
  return {
    type: 'success',
    durationSeconds,
    bucketCount: 4,
    peaks: new Float32Array([0, 0.5, 1, 0.25]),
  };
}

describe('WaveformServiceImpl', () => {
  beforeEach(() => {
    mockAnalyze.mockClear();
    resolvers.length = 0;
  });

  it('starts in waiting state with no file', () => {
    const service = new WaveformServiceImpl({ version: 'original' });

    expect(service.view.state).toBe('waiting');
    expect(service.view.peaks).toBeNull();
    expect(service.view.fileName).toBeNull();
  });

  it('moves to preparing when a file is loaded', async () => {
    const service = new WaveformServiceImpl({ version: 'edited' });

    service.loadFile(makeFile('x.wav'));
    await flush();

    expect(service.view.state).toBe('preparing');
    expect(service.view.fileName).toBe('x.wav');
    expect(service.view.message).toBe('Preparing waveform…');
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
  });

  it('falls back for unsupported extensions without analysis', () => {
    const service = new WaveformServiceImpl({ version: 'original' });
    const file = new File(['hello'], 'x.txt', { type: 'text/plain' });

    service.loadFile(file);

    // An extension the analyzer cannot handle is skipped up front (fallback),
    // leaving audio playable.
    expect(service.view.state).toBe('fallback');
    expect(mockAnalyze).not.toHaveBeenCalled();
    expect(service.view.message).toBeNull();
  });

  it('becomes ready when the worker returns peaks', async () => {
    const service = new WaveformServiceImpl({ version: 'original' });

    service.loadFile(makeFile('x.wav'));
    await flush();
    expect(service.view.state).toBe('preparing');

    resolvers[0]!(successResult());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.view.state).toBe('ready');
    expect(service.view.peaks?.bucketCount).toBe(4);
    expect(service.view.durationSeconds).toBe(2);
    expect(service.view.message).toBeNull();
  });

  it('ignores a stale result after the file is replaced', async () => {
    const service = new WaveformServiceImpl({ version: 'original' });

    service.loadFile(makeFile('a.wav'));
    await flush();
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
    const staleResolver = resolvers[0];

    service.loadFile(makeFile('b.wav'));
    await flush();
    expect(mockAnalyze).toHaveBeenCalledTimes(2);

    expect(service.view.fileName).toBe('b.wav');
    expect(service.view.state).toBe('preparing');

    staleResolver!(successResult(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(service.view.state).toBe('preparing');
    expect(service.view.fileName).toBe('b.wav');

    resolvers[1]!(successResult(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(service.view.state).toBe('ready');
    expect(service.view.durationSeconds).toBe(2);
  });

  it('clears to waiting when the file is removed', () => {
    const service = new WaveformServiceImpl({ version: 'edited' });

    service.loadFile(makeFile('x.wav'));
    service.loadFile(null);

    expect(service.view.state).toBe('waiting');
    expect(service.view.fileName).toBeNull();
    expect(service.view.peaks).toBeNull();
  });

  it('requestedBucketCount scales with width and is capped', () => {
    const service = new WaveformServiceImpl({ version: 'original' });

    expect(service.requestedBucketCount(400, 1)).toBeGreaterThanOrEqual(1200);
    expect(service.requestedBucketCount(2000, 2)).toBe(2400);
    expect(service.requestedBucketCount(10, 1)).toBeGreaterThanOrEqual(1200);
  });
});
