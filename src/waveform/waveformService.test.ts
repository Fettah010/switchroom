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
  // WAV analysis now performs a header preflight read before the full read,
  // so allow both FileReader macrotasks to settle.
  await new Promise((resolve) => setTimeout(resolve, 15));
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

  it('reports unsupported extensions as unavailable without analysis', () => {
    const service = new WaveformServiceImpl({ version: 'original' });
    const file = new File(['hello'], 'x.txt', { type: 'text/plain' });

    service.loadFile(file);

    // A format the analyzer cannot handle has no preview; playback is still
    // available, and the state says so honestly.
    expect(service.view.state).toBe('unavailable');
    expect(service.view.message).toMatch(/unavailable for this format/i);
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it('maps a worker failure to unavailable instead of staying in preparing', async () => {
    const service = new WaveformServiceImpl({ version: 'original' });

    service.loadFile(makeFile('x.wav'));
    await flush();
    expect(service.view.state).toBe('preparing');

    resolvers[0]!({
      type: 'failure',
      reason: 'unsupported',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.view.state).toBe('unavailable');
    expect(service.view.message).toMatch(/unavailable for this format/i);
  });

  it('maps an oversized WAV header to fallback before reading the whole file', async () => {
    const service = new WaveformServiceImpl({ version: 'original' });

    // A tiny file whose header claims 4 hours of 44.1 kHz stereo PCM. The
    // preflight should skip analysis without invoking the worker.
    const header = new ArrayBuffer(64);
    const view = new DataView(header);
    const write = (offset: number, text: string): void => {
      for (let index = 0; index < text.length; index += 1) {
        view.setUint8(offset + index, text.charCodeAt(index));
      }
    };
    write(0, 'RIFF');
    view.setUint32(4, 64 - 8, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, 44100, true);
    view.setUint32(28, 44100 * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, 4 * 44100 * 2 * 4 * 60 * 60, true);

    const file = new File([header], 'long.wav', { type: 'audio/wav' });

    service.loadFile(file);
    await flush();
    await flush();

    expect(service.view.state).toBe('fallback');
    expect(service.view.message).toMatch(/preview skipped/i);
    expect(mockAnalyze).not.toHaveBeenCalled();
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
