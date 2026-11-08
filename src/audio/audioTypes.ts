/**
 * Public audio types shared by the engine, the React layer and the tests.
 *
 * The interfaces below describe the small slice of the Web Audio and media
 * element APIs the engine actually uses. Keeping them explicit lets the engine
 * run under jsdom/unit tests with a deterministic fake host, while the browser
 * host is a thin adapter over the real platform objects.
 */

export type AudioVersion = 'original' | 'edited';

export const AUDIO_VERSIONS: readonly AudioVersion[] = ['original', 'edited'];

export type PlayerStatus =
  'empty' | 'incomplete' | 'loading' | 'ready' | 'paused' | 'playing' | 'error';

export interface DeckInfo {
  fileName: string | null;
  fileSize: number | null;
  extension: string | null;
  duration: number | null;
  ready: boolean;
  loading: boolean;
  error: string | null;
  warning: string | null;
}

export interface ABPlayerSnapshot {
  status: PlayerStatus;
  activeVersion: AudioVersion;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  crossfadeMs: number;
  original: DeckInfo;
  edited: DeckInfo;
  durationMismatch: boolean;
  globalError: string | null;
}

export interface AudioElementLike extends EventTarget {
  src: string;
  preload: string;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
}

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
  cancelScheduledValues(time: number): void;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): void;
  disconnect?(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export type MediaElementSourceLike = AudioNodeLike;

export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: AudioContextState;
  readonly destination: AudioNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
  createGain(): GainNodeLike;
  createMediaElementSource(element: AudioElementLike): MediaElementSourceLike;
}

export interface AudioHost {
  createAudioElement(): AudioElementLike;
  createAudioContext(): AudioContextLike;
  createObjectURL(file: File): string;
  revokeObjectURL(url: string): void;
  /** `HTMLMediaElement.canPlayType` hint for a MIME type. May return ''. */
  probeCanPlayType(mimeType: string): string;
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
}

export interface AudioEngineOptions {
  host?: AudioHost;
  crossfadeMs?: number;
  logger?: (message: string, details?: unknown) => void;
}

export type Unsubscribe = () => void;
