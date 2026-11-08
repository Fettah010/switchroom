import type {
  AudioContextLike,
  AudioElementLike,
  AudioHost,
  AudioParamLike,
  GainNodeLike,
  MediaElementSourceLike,
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
  preload = 'metadata';
  paused = true;
  duration = Number.NaN;
  loadCount = 0;
  seekCount = 0;
  playAttempts = 0;
  private position = 0;

  constructor(private readonly host: FakeAudioHost) {
    super();
  }

  get currentTime(): number {
    return this.position;
  }

  set currentTime(value: number) {
    this.position = value;
    this.seekCount += 1;
    queueMicrotask(() => {
      if (this.src) {
        this.dispatchEvent(new Event('seeked'));
      }
    });
  }

  play(): Promise<void> {
    this.playAttempts += 1;

    if (this.host.rejectPlay) {
      return Promise.reject(new DOMException('Playback blocked', 'NotAllowedError'));
    }

    this.paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }

  load(): void {
    this.loadCount += 1;
    this.duration = Number.NaN;

    const url = this.src;

    if (!url) {
      queueMicrotask(() => this.dispatchEvent(new Event('emptied')));
      return;
    }

    const entry = this.host.filesByUrl.get(url);

    queueMicrotask(() => {
      if (this.src !== url) {
        return;
      }

      if (!entry || entry.fail) {
        this.dispatchEvent(new Event('error'));
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
}

export class FakeAudioContext implements AudioContextLike {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  readonly destination = {
    connect: () => undefined,
    disconnect: () => undefined,
  };
  readonly gains: FakeGainNode[] = [];
  readonly sources: FakeMediaElementSource[] = [];
  resumeCalls = 0;
  closeCalls = 0;

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = 'running';
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closeCalls += 1;
    this.state = 'closed';
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
  canPlayTypeResult = 'probably';
  rejectPlay = false;
  private urlCounter = 0;

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
