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
  | 'empty'
  | 'incomplete'
  | 'loading'
  | 'ready'
  | 'starting'
  | 'playing'
  | 'switching'
  | 'paused'
  | 'interrupted'
  | 'error';

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
  /** The version the user selected. May differ from `audibleVersion` mid-switch. */
  activeVersion: AudioVersion;
  /** The deck that is actually carrying the audio right now. */
  audibleVersion: AudioVersion;
  /** Non-null while a switch is aligning or fading. */
  switchingTo: AudioVersion | null;
  isPlaying: boolean;
  isStarting: boolean;
  /** True after the browser suspended/interrupted audio until the user resumes. */
  interrupted: boolean;
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

export interface MediaErrorLike {
  readonly code: number;
}

export interface AudioElementLike extends EventTarget {
  src: string;
  crossOrigin: string | null;
  preload: string;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly error: MediaErrorLike | null;
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

/**
 * Browsers expose `running`, `suspended` and `closed`. Some platforms also
 * report an intermediate `interrupted` state; we model it without assuming
 * every browser produces it.
 */
export type AudioContextStateLike = 'running' | 'suspended' | 'interrupted' | 'closed';

export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: AudioContextStateLike;
  readonly destination: AudioNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
  createGain(): GainNodeLike;
  createMediaElementSource(element: AudioElementLike): MediaElementSourceLike;
  addEventListener?(type: string, listener: () => void): void;
  removeEventListener?(type: string, listener: () => void): void;
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
  setTimeout(callback: () => void, milliseconds: number): number;
  clearTimeout(handle: number): void;
}

export interface AudioEngineOptions {
  host?: AudioHost;
  crossfadeMs?: number;
  metadataTimeoutMs?: number;
  logger?: (message: string, details?: unknown) => void;
}

export type Unsubscribe = () => void;
