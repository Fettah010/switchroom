import type {
  AudioContextLike,
  AudioContextStateLike,
  AudioElementLike,
  AudioHost,
  AudioParamLike,
  GainNodeLike,
  MediaElementSourceLike,
  MediaErrorLike,
} from '../audio/audioTypes';

export interface FakeAudioParamCall {
  method: 'setValueAtTime' | 'linearRampToValueAtTime' | 'cancelScheduledValues';
  value: number;
  time: number;
}

export class FakeAudioParam implements AudioParamLike {
  value = 0;
  calls: FakeAudioParamCall[] = [];

  setValueAtTime(value: number, time: number): void {
    this.value = value;
    this.calls.push({ method: 'setValueAtTime', value, time });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.calls.push({ method: 'linearRampToValueAtTime', value, time });
  }

  cancelScheduledValues(time: number): void {
    this.calls.push({ method: 'cancelScheduledValues', value: this.value, time });
  }
}

export class FakeGainNode implements GainNodeLike {
  readonly gain = new FakeAudioParam();
  connections: AudioNodeLikeLike[] = [];

  connect(destination: AudioNodeLikeLike): void {
    this.connections.push(destination);
  }

  disconnect(): void {
    this.connections = [];
  }
}

type AudioNodeLikeLike = Parameters<GainNodeLike['connect']>[0];

class FakeMediaElementSource implements MediaElementSourceLike {
  connections: AudioNodeLikeLike[] = [];

  constructor(readonly element: FakeAudioElement) {}

  connect(destination: AudioNodeLikeLike): void {
    this.connections.push(destination);
  }

  disconnect(): void {
    this.connections = [];
  }
}

export class FakeAudioElement extends EventTarget implements AudioElementLike {
  src = '';
  crossOrigin: string | null = null;
  preload = 'metadata';
  paused = true;
  duration = Number.NaN;
  error: MediaErrorLike | null = null;
  loadCount = 0;
  seekCount = 0;
  playAttempts = 0;
  private position = 0;
  private playToken = 0;

  constructor(private readonly host: FakeAudioHost) {
    super();
  }

  get currentTime(): number {
    return this.position;
  }

  set currentTime(value: number) {
    this.position = value;
    this.seekCount += 1;

    if (this.host.suppressSeeked) {
      return;
    }

    queueMicrotask(() => {
      if (this.src) {
        this.dispatchEvent(new Event('seeked'));
      }
    });
  }

  async play(): Promise<void> {
    this.playAttempts += 1;
    const token = ++this.playToken;

    if (this.host.rejectPlay || this.host.rejectPlayFor?.(this)) {
      throw new DOMException('Playback blocked', 'NotAllowedError');
    }

    if (this.host.playGate) {
      await this.host.playGate;
    }

    if (token !== this.playToken) {
      throw new DOMException('Playback aborted', 'AbortError');
    }

    this.paused = false;
    this.dispatchEvent(new Event('play'));
    this.dispatchEvent(new Event('playing'));
  }

  pause(): void {
    this.playToken += 1;
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }

  load(): void {
    this.loadCount += 1;
    this.duration = Number.NaN;
    this.error = null;

    const url = this.src;

    if (!url) {
      queueMicrotask(() => {
        if (this.src === url) {
          this.dispatchEvent(new Event('emptied'));
        }
      });
      return;
    }

    const entry = this.host.filesByUrl.get(url);

    queueMicrotask(() => {
      if (this.src !== url) {
        return;
      }

      if (!entry || entry.fail) {
        this.error = { code: this.host.errorCodeFor?.(entry) ?? 4 };
        this.dispatchEvent(new Event('error'));
        return;
      }

      if (entry.neverLoads) {
        return;
      }

      this.duration = entry.duration;
      this.dispatchEvent(new Event('loadedmetadata'));
      this.dispatchEvent(new Event('canplay'));
    });
  }

  removeAttribute(name: string): void {
    if (name === 'src') {
      this.src = '';
    }
  }

  /** Test helper: pretend the media clock advanced. */
  advance(seconds: number): void {
    this.position += seconds;
  }

  /** Test helper: publish a new duration the way a browser would. */
  publishDuration(duration: number): void {
    this.duration = duration;
    this.dispatchEvent(new Event('durationchange'));
  }
}

export class FakeAudioContext extends EventTarget implements AudioContextLike {
  state: AudioContextStateLike = 'suspended';
  currentTime = 0;
  readonly destination = {
    connect: () => undefined,
    disconnect: () => undefined,
  };
  readonly gains: FakeGainNode[] = [];
  readonly sources: FakeMediaElementSource[] = [];
  resumeCalls = 0;
  closeCalls = 0;

  setState(next: AudioContextStateLike): void {
    this.state = next;
    this.dispatchEvent(new Event('statechange'));
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.setState('running');
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closeCalls += 1;
    this.setState('closed');
    return Promise.resolve();
  }

  createGain(): FakeGainNode {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
  }

  createMediaElementSource(element: AudioElementLike): FakeMediaElementSource {
    const source = new FakeMediaElementSource(element as FakeAudioElement);
    this.sources.push(source);
    return source;
  }
}

export interface FakeFileEntry {
  name: string;
  duration: number;
  fail?: boolean;
  neverLoads?: boolean;
}

export class FakeAudioHost implements AudioHost {
  readonly elements: FakeAudioElement[] = [];
  readonly contexts: FakeAudioContext[] = [];
  readonly filesByUrl = new Map<string, FakeFileEntry>();
  readonly createdUrls: string[] = [];
  readonly revokedUrls: string[] = [];
  /** Maps a file name to the duration the fake element should report. */
  durationFor: (file: File) => number = () => 2;
  shouldFailLoad: (file: File) => boolean = () => false;
  shouldNeverLoad: (file: File) => boolean = () => false;
  errorCodeFor: (entry: FakeFileEntry | undefined) => number = () => 4;
  canPlayTypeResult = 'probably';
  rejectPlay = false;
  rejectPlayFor: ((element: FakeAudioElement) => boolean) | null = null;
  suppressSeeked = false;
  manualTimers = false;
  private urlCounter = 0;
  private timerCounter = 0;
  private readonly timers = new Map<number, number | (() => void)>();
  private gate: Promise<void> | null = null;
  private releaseGate: (() => void) | null = null;

  get playGate(): Promise<void> | null {
    return this.gate;
  }

  holdPlay(): void {
    this.gate = new Promise<void>((resolve) => {
      this.releaseGate = resolve;
    });
  }

  releasePlay(): void {
    this.releaseGate?.();
    this.releaseGate = null;
    this.gate = null;
  }

  createAudioElement(): AudioElementLike {
    const element = new FakeAudioElement(this);
    this.elements.push(element);
    return element;
  }

  createAudioContext(): AudioContextLike {
    const context = new FakeAudioContext();
    this.contexts.push(context);
    return context;
  }

  createObjectURL(file: File): string {
    this.urlCounter += 1;
    const url = `blob:fake/${this.urlCounter}`;
    this.createdUrls.push(url);
    this.filesByUrl.set(url, {
      name: file.name,
      duration: this.durationFor(file),
      fail: this.shouldFailLoad(file),
      neverLoads: this.shouldNeverLoad(file),
    });
    return url;
  }

  revokeObjectURL(url: string): void {
    this.revokedUrls.push(url);
  }

  probeCanPlayType(): string {
    return this.canPlayTypeResult;
  }

  requestFrame(): number {
    // No automatic ticking: tests drive time explicitly.
    return 0;
  }

  cancelFrame(): void {
    // Nothing scheduled.
  }

  setTimeout(callback: () => void, milliseconds: number): number {
    this.timerCounter += 1;
    const id = this.timerCounter;

    if (this.manualTimers) {
      this.timers.set(id, callback);
      return id;
    }

    const handle = window.setTimeout(() => {
      this.timers.delete(id);
      callback();
    }, milliseconds);

    this.timers.set(id, handle);
    return id;
  }

  clearTimeout(handle: number): void {
    const timer = this.timers.get(handle);

    if (timer === undefined) {
      return;
    }

    this.timers.delete(handle);

    if (typeof timer === 'number') {
      window.clearTimeout(timer);
    }
  }

  /** Fires every manual timer, ignoring the delay. */
  runTimeouts(): void {
    const callbacks = [...this.timers.values()].filter(
      (timer): timer is () => void => typeof timer === 'function',
    );
    this.timers.clear();

    for (const callback of callbacks) {
      callback();
    }
  }

  get pendingTimeoutCount(): number {
    return this.timers.size;
  }

  get element(): FakeAudioElement {
    const [element] = this.elements;
    if (!element) {
      throw new Error('No fake audio element created yet');
    }
    return element;
  }
}

export function makeWavFile(name = 'original.wav', size = 2048): File {
  return new File([new Uint8Array(size)], name, { type: 'audio/wav' });
}

export async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 5));
}
