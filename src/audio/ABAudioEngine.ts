import type {
  ABPlayerSnapshot,
  AudioContextLike,
  AudioEngineOptions,
  AudioHost,
  AudioVersion,
  DeckInfo,
  GainNodeLike,
  MediaElementSourceLike,
  PlayerStatus,
  Unsubscribe,
} from './audioTypes';
import { createBrowserAudioHost } from './audioHost';
import {
  DEFAULT_CROSSFADE_MS,
  GAIN_SCHEDULE_LEAD_SECONDS,
  applyGainHold,
  applyGainRamp,
  clampGain,
  crossfadeTargets,
  interpolateRamp,
  planCrossfade,
  type DeckGains,
  type GainRamp,
} from './crossfade';
import {
  compatibilityWarning,
  getFileExtension,
  validateAudioFile,
  type FileValidationResult,
} from './fileValidation';
import {
  calculateCommonDuration,
  clampSeek,
  hasDurationMismatch,
  isValidDuration,
} from './timeFormatting';

const SYNC_TOLERANCE_SECONDS = 0.05;
const END_TOLERANCE_SECONDS = 0.03;
const SYNC_WAIT_TIMEOUT_MS = 600;

const VERSION_LABEL: Record<AudioVersion, string> = {
  original: 'Original',
  edited: 'Edited',
};

function emptyDeckInfo(): DeckInfo {
  return {
    fileName: null,
    fileSize: null,
    extension: null,
    duration: null,
    ready: false,
    loading: false,
    error: null,
    warning: null,
  };
}

interface Deck {
  version: AudioVersion;
  element: ReturnType<AudioHost['createAudioElement']>;
  gain: GainNodeLike | null;
  source: MediaElementSourceLike | null;
  url: string | null;
  generation: number;
  ramp: GainRamp | null;
  loadCleanup: (() => void) | null;
  info: DeckInfo;
}

type ListenCleanup = () => void;

/**
 * Owns both media decks, the Web Audio graph, playback state and object URLs.
 *
 * Framework-independent by design: React subscribes through `subscribe` /
 * `getSnapshot`, and tests inject an `AudioHost` so no real audio is required.
 */
export class ABAudioEngine {
  private readonly host: AudioHost;
  private readonly crossfadeMs: number;
  private readonly logger: (message: string, details?: unknown) => void;
  private readonly decks: Record<AudioVersion, Deck>;
  private readonly listeners = new Set<() => void>();
  private readonly timeListeners = new Set<(time: number) => void>();
  private readonly lifecycleCleanup: ListenCleanup[] = [];

  private snapshot: ABPlayerSnapshot;
  private audioContext: AudioContextLike | null = null;
  private masterGain: GainNodeLike | null = null;
  private isPlaying = false;
  private hasStarted = false;
  private audibleVersion: AudioVersion = 'original';
  private frameHandle: number | null = null;
  private switchSequence = 0;
  private disposed = false;

  constructor(options: AudioEngineOptions = {}) {
    this.host = options.host ?? createBrowserAudioHost();
    const requestedCrossfade = options.crossfadeMs;
    this.crossfadeMs =
      typeof requestedCrossfade === 'number' && requestedCrossfade > 0
        ? requestedCrossfade
        : DEFAULT_CROSSFADE_MS;
    this.logger = options.logger ?? (() => undefined);

    this.decks = {
      original: this.createDeck('original'),
      edited: this.createDeck('edited'),
    };

    this.snapshot = {
      status: 'empty',
      activeVersion: 'original',
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 1,
      muted: false,
      crossfadeMs: this.crossfadeMs,
      original: this.decks.original.info,
      edited: this.decks.edited.info,
      durationMismatch: false,
      globalError: null,
    };
  }

  // ---------------------------------------------------------------------------
  // Public store contract
  // ---------------------------------------------------------------------------

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ABPlayerSnapshot => this.snapshot;

  subscribeToTime = (listener: (time: number) => void): Unsubscribe => {
    this.timeListeners.add(listener);
    return () => {
      this.timeListeners.delete(listener);
    };
  };

  // ---------------------------------------------------------------------------
  // File intake
  // ---------------------------------------------------------------------------

  loadFile(version: AudioVersion, file: File): FileValidationResult {
    if (this.disposed) {
      return { ok: false, message: 'The player is no longer available.' };
    }

    const validation = validateAudioFile(file);

    if (!validation.ok) {
      return validation;
    }

    const deck = this.decks[version];

    this.haltPlayback();
    this.hasStarted = false;
    this.releaseDeckMedia(deck);
    this.applySeek(0, false);

    const url = this.host.createObjectURL(file);
    deck.url = url;
    deck.generation += 1;
    const generation = deck.generation;

    deck.info = {
      fileName: file.name,
      fileSize: file.size,
      extension: getFileExtension(file.name),
      duration: null,
      ready: false,
      loading: true,
      error: null,
      warning: compatibilityWarning(file, (mimeType) => this.host.probeCanPlayType(mimeType)),
    };

    this.attachLoadListeners(deck, generation);
    this.snapshot = { ...this.snapshot, globalError: null };
    this.refresh();
    this.emitTime(0);

    try {
      deck.element.src = url;
      deck.element.load();
    } catch (error) {
      this.failDeck(deck, generation, 'This file could not be opened. Try another export.');
      this.logger('media load threw', error);
    }

    return validation;
  }

  removeFile(version: AudioVersion): void {
    if (this.disposed) {
      return;
    }

    this.haltPlayback();
    this.hasStarted = false;

    const deck = this.decks[version];
    this.releaseDeckMedia(deck);
    deck.generation += 1;
    deck.info = emptyDeckInfo();

    const other = this.decks[version === 'original' ? 'edited' : 'original'];
    if (other.info.ready) {
      this.seekElementSafely(other, 0);
    }

    this.snapshot = { ...this.snapshot, currentTime: 0 };
    this.emitTime(0);
    this.refresh();
  }

  // ---------------------------------------------------------------------------
  // Transport
  // ---------------------------------------------------------------------------

  async play(): Promise<void> {
    if (this.disposed || this.isPlaying || !this.bothReady()) {
      return;
    }

    this.snapshot = { ...this.snapshot, globalError: null };

    try {
      const context = this.ensureGraph();

      if (context.state === 'suspended') {
        await context.resume();
      }

      if (context.state !== 'running') {
        throw new Error('AudioContext is not running');
      }

      if (
        isValidDuration(this.snapshot.duration) &&
        this.snapshot.currentTime >= this.snapshot.duration - 0.02
      ) {
        this.applySeek(0, false);
      }

      this.applyGainsImmediate();

      const active = this.decks[this.snapshot.activeVersion];
      const inactive = this.decks[this.otherVersion(this.snapshot.activeVersion)];

      await Promise.all([active.element.play(), inactive.element.play()]);

      if (this.disposed) {
        return;
      }

      this.isPlaying = true;
      this.hasStarted = true;
      this.syncDeckTo(active, inactive);
      this.startTicker();
      this.refresh();
      this.emitTime(this.readPlayhead());
    } catch (error) {
      this.logger('playback failed', error);
      this.haltPlayback();
      this.snapshot = {
        ...this.snapshot,
        globalError: 'Your browser blocked audio playback. Press Play again.',
        status: this.computeStatus(),
      };
      this.refresh();
    }
  }

  pause(): void {
    if (this.disposed) {
      return;
    }

    this.haltPlayback();
    this.snapshot = { ...this.snapshot, currentTime: this.readPlayhead() };
    this.emitTime(this.snapshot.currentTime);
    this.refresh();
  }

  seek(seconds: number): void {
    if (this.disposed) {
      return;
    }

    this.applySeek(seconds, true);
  }

  async switchTo(version: AudioVersion): Promise<void> {
    if (this.disposed || !this.bothReady() || version === this.snapshot.activeVersion) {
      return;
    }

    const sequence = ++this.switchSequence;
    const previousVersion = this.snapshot.activeVersion;
    const canonicalTime = this.isPlaying ? this.readPlayhead() : this.snapshot.currentTime;

    this.snapshot = { ...this.snapshot, activeVersion: version, globalError: null };
    this.refresh();

    if (!this.isPlaying) {
      this.applyGainsImmediate();
      return;
    }

    const target = this.decks[version];
    const aligned = await this.ensureAligned(target, canonicalTime);

    if (this.disposed || sequence !== this.switchSequence) {
      return;
    }

    if (!aligned) {
      this.snapshot = {
        ...this.snapshot,
        activeVersion: previousVersion,
        globalError:
          'The selected version could not be synchronized. Playback stayed on the current version.',
      };
      this.applyGainsImmediate();
      this.refresh();
      return;
    }

    if (target.element.paused) {
      try {
        await target.element.play();
      } catch (error) {
        this.logger('deck restart failed', error);

        if (sequence === this.switchSequence) {
          this.snapshot = {
            ...this.snapshot,
            activeVersion: previousVersion,
            globalError:
              'The selected version could not start. Playback stayed on the current version.',
          };
          this.applyGainsImmediate();
          this.refresh();
        }

        return;
      }
    }

    if (sequence !== this.switchSequence) {
      return;
    }

    this.audibleVersion = version;
    this.scheduleFade();
  }

  setVolume(value: number): void {
    if (this.disposed) {
      return;
    }

    const volume = clampGain(value);
    this.snapshot = {
      ...this.snapshot,
      volume,
      muted: volume > 0 ? false : this.snapshot.muted,
    };
    this.applyMasterGain();
    this.refresh();
  }

  setMuted(muted: boolean): void {
    if (this.disposed) {
      return;
    }

    this.snapshot = { ...this.snapshot, muted };
    this.applyMasterGain();
    this.refresh();
  }

  /** Read-only diagnostics for E2E checks. Not used by the interface. */
  getDeckDiagnostics(): Record<
    AudioVersion,
    { currentTime: number; paused: boolean; gain: number; ready: boolean }
  > {
    const now = this.audioContext?.currentTime ?? 0;
    const targets = crossfadeTargets(this.snapshot.activeVersion);

    return {
      original: {
        currentTime: this.decks.original.element.currentTime,
        paused: this.decks.original.element.paused,
        gain: this.decks.original.gain
          ? this.currentGain(this.decks.original, now)
          : targets.original,
        ready: this.decks.original.info.ready,
      },
      edited: {
        currentTime: this.decks.edited.element.currentTime,
        paused: this.decks.edited.element.paused,
        gain: this.decks.edited.gain ? this.currentGain(this.decks.edited, now) : targets.edited,
        ready: this.decks.edited.info.ready,
      },
    };
  }

  dispose = (): void => {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.stopTicker();
    this.isPlaying = false;

    for (const cleanup of this.lifecycleCleanup.splice(0)) {
      cleanup();
    }

    for (const version of ['original', 'edited'] as const) {
      const deck = this.decks[version];
      this.cleanupLoad(deck);
      deck.element.pause();
      deck.element.removeAttribute('src');
      deck.element.load();

      if (deck.url) {
        this.host.revokeObjectURL(deck.url);
        deck.url = null;
      }

      try {
        deck.source?.disconnect?.();
        deck.gain?.disconnect?.();
      } catch {
        // Disconnecting an already-disconnected node is harmless.
      }

      deck.source = null;
      deck.gain = null;
      deck.ramp = null;
    }

    this.masterGain = null;
    const context = this.audioContext;
    this.audioContext = null;

    if (context && context.state !== 'closed') {
      void context.close().catch((error: unknown) => this.logger('context close failed', error));
    }

    this.listeners.clear();
    this.timeListeners.clear();
  };

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private createDeck(version: AudioVersion): Deck {
    const element = this.host.createAudioElement();
    const deck: Deck = {
      version,
      element,
      gain: null,
      source: null,
      url: null,
      generation: 0,
      ramp: null,
      loadCleanup: null,
      info: emptyDeckInfo(),
    };

    this.listen(deck.element, 'ended', () => this.handleEnded(deck));

    return deck;
  }

  private otherVersion(version: AudioVersion): AudioVersion {
    return version === 'original' ? 'edited' : 'original';
  }

  private bothReady(): boolean {
    return this.decks.original.info.ready && this.decks.edited.info.ready;
  }

  private readPlayhead(): number {
    const version = this.isPlaying ? this.audibleVersion : this.snapshot.activeVersion;
    const active = this.decks[version];
    const time = active.element.currentTime;

    if (!Number.isFinite(time)) {
      return this.snapshot.currentTime;
    }

    if (!isValidDuration(this.snapshot.duration)) {
      return Math.max(time, 0);
    }

    return Math.min(Math.max(time, 0), this.snapshot.duration);
  }

  private computeStatus(): PlayerStatus {
    if (this.snapshot.globalError) {
      return 'error';
    }

    if (this.isPlaying) {
      return 'playing';
    }

    const original = this.decks.original.info;
    const edited = this.decks.edited.info;

    if (original.loading || edited.loading) {
      return 'loading';
    }

    if (original.error || edited.error) {
      return 'error';
    }

    if (original.ready && edited.ready) {
      return this.hasStarted ? 'paused' : 'ready';
    }

    if (!original.fileName && !edited.fileName) {
      return 'empty';
    }

    return 'incomplete';
  }

  private refresh(): void {
    if (this.disposed) {
      return;
    }

    const original = this.decks.original.info;
    const edited = this.decks.edited.info;
    const duration = calculateCommonDuration(original.duration, edited.duration) ?? 0;
    const durationMismatch = hasDurationMismatch(original.duration, edited.duration);
    const currentTime = isValidDuration(duration)
      ? clampSeek(this.snapshot.currentTime, duration)
      : 0;

    this.snapshot = {
      ...this.snapshot,
      status: this.computeStatus(),
      isPlaying: this.isPlaying,
      currentTime,
      duration,
      durationMismatch,
      original,
      edited,
    };

    this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        this.logger('snapshot listener failed', error);
      }
    }
  }

  private emitTime(time: number): void {
    const clamped = isValidDuration(this.snapshot.duration)
      ? clampSeek(time, this.snapshot.duration)
      : Math.max(Number.isFinite(time) ? time : 0, 0);

    this.snapshot = { ...this.snapshot, currentTime: clamped };

    for (const listener of [...this.timeListeners]) {
      try {
        listener(clamped);
      } catch (error) {
        this.logger('time listener failed', error);
      }
    }
  }

  private applySeek(seconds: number, emit: boolean): void {
    const duration = this.snapshot.duration;
    const target = isValidDuration(duration) ? clampSeek(seconds, duration) : 0;

    for (const version of ['original', 'edited'] as const) {
      const deck = this.decks[version];

      if (deck.info.ready) {
        this.seekElementSafely(deck, target);
      }
    }

    this.snapshot = { ...this.snapshot, currentTime: target };

    if (emit) {
      this.emitTime(target);
      this.refresh();
    }
  }

  private seekElementSafely(deck: Deck, time: number): void {
    try {
      deck.element.currentTime = time;
    } catch (error) {
      this.logger(`could not seek ${deck.version}`, error);
    }
  }

  private ensureGraph(): AudioContextLike {
    if (this.audioContext) {
      return this.audioContext;
    }

    const context = this.host.createAudioContext();
    this.audioContext = context;

    const master = context.createGain();
    master.connect(context.destination);
    this.masterGain = master;

    const targets = crossfadeTargets(this.snapshot.activeVersion);

    for (const version of ['original', 'edited'] as const) {
      const deck = this.decks[version];
      const gain = context.createGain();
      gain.gain.setValueAtTime(targets[version], context.currentTime);
      gain.connect(master);

      const source = context.createMediaElementSource(deck.element);
      source.connect(gain);

      deck.gain = gain;
      deck.source = source;
      deck.ramp = null;
    }

    this.applyMasterGain();
    return context;
  }

  private applyMasterGain(): void {
    if (!this.masterGain || !this.audioContext) {
      return;
    }

    const value = this.snapshot.muted ? 0 : this.snapshot.volume;
    const now = this.audioContext.currentTime;
    const param = this.masterGain.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(clampGain(value), now);
  }

  private currentGain(deck: Deck, time: number): number {
    const ramped = interpolateRamp(deck.ramp, time);

    if (ramped !== null) {
      return ramped;
    }

    return deck.gain ? clampGain(deck.gain.gain.value) : 0;
  }

  private applyGainsImmediate(): void {
    if (!this.audioContext) {
      return;
    }

    this.audibleVersion = this.snapshot.activeVersion;
    const now = this.audioContext.currentTime;
    const targets = crossfadeTargets(this.snapshot.activeVersion);

    for (const version of ['original', 'edited'] as const) {
      const deck = this.decks[version];

      if (deck.gain) {
        deck.ramp = applyGainHold(deck.gain.gain, targets[version], now);
      }
    }
  }

  private scheduleFade(): void {
    if (!this.audioContext || !this.isPlaying) {
      this.applyGainsImmediate();
      return;
    }

    const startTime = this.audioContext.currentTime + GAIN_SCHEDULE_LEAD_SECONDS;
    const durationSeconds = this.crossfadeMs / 1000;
    const currentGains: DeckGains = {
      original: this.currentGain(this.decks.original, startTime),
      edited: this.currentGain(this.decks.edited, startTime),
    };
    const plan = planCrossfade(
      this.snapshot.activeVersion,
      currentGains,
      startTime,
      durationSeconds,
    );

    for (const version of ['original', 'edited'] as const) {
      const deck = this.decks[version];

      if (deck.gain) {
        deck.ramp = applyGainRamp(deck.gain.gain, plan[version]);
      }
    }
  }

  private haltPlayback(): void {
    this.stopTicker();
    this.isPlaying = false;

    this.decks.original.element.pause();
    this.decks.edited.element.pause();
    this.applyGainsImmediate();
  }

  private handleEnded(deck: Deck): void {
    if (!this.isPlaying || !isValidDuration(this.snapshot.duration)) {
      return;
    }

    const deckDuration = deck.info.duration;
    const isCommonEnd =
      isValidDuration(deckDuration) && Math.abs(deckDuration - this.snapshot.duration) < 0.05;

    if (isCommonEnd || deck.version === this.snapshot.activeVersion) {
      this.finishPlayback();
    }
  }

  private finishPlayback(): void {
    const endTime = this.snapshot.duration;
    this.haltPlayback();
    this.snapshot = { ...this.snapshot, currentTime: endTime };
    this.emitTime(endTime);
    this.refresh();
  }

  private startTicker(): void {
    if (this.frameHandle !== null) {
      return;
    }

    const step = (): void => {
      this.frameHandle = null;

      if (this.disposed || !this.isPlaying) {
        return;
      }

      const time = this.readPlayhead();
      this.emitTime(time);

      if (
        isValidDuration(this.snapshot.duration) &&
        time >= this.snapshot.duration - END_TOLERANCE_SECONDS
      ) {
        this.finishPlayback();
        return;
      }

      this.frameHandle = this.host.requestFrame(step);
    };

    this.frameHandle = this.host.requestFrame(step);
  }

  private stopTicker(): void {
    if (this.frameHandle !== null) {
      this.host.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }

  private syncDeckTo(source: Deck, target: Deck): void {
    if (!target.info.ready) {
      return;
    }

    const difference = Math.abs(target.element.currentTime - source.element.currentTime);

    if (difference > SYNC_TOLERANCE_SECONDS) {
      this.seekElementSafely(target, source.element.currentTime);
    }
  }

  private async ensureAligned(deck: Deck, time: number): Promise<boolean> {
    if (Math.abs(deck.element.currentTime - time) <= SYNC_TOLERANCE_SECONDS) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timeout = 0;

      const finish = (value: boolean): void => {
        if (settled) {
          return;
        }

        settled = true;
        deck.element.removeEventListener('seeked', onSeeked);
        window.clearTimeout(timeout);
        resolve(value);
      };

      const onSeeked = (): void => finish(true);

      deck.element.addEventListener('seeked', onSeeked);
      timeout = window.setTimeout(() => finish(false), SYNC_WAIT_TIMEOUT_MS);

      try {
        deck.element.currentTime = time;
      } catch (error) {
        this.logger('alignment seek failed', error);
        finish(false);
      }
    });
  }

  private attachLoadListeners(deck: Deck, generation: number): void {
    this.cleanupLoad(deck);

    const isCurrent = (): boolean => deck.generation === generation && !this.disposed;

    const onLoadedMetadata = (): void => {
      if (!isCurrent()) {
        return;
      }

      const duration = deck.element.duration;

      if (!Number.isFinite(duration) || duration <= 0) {
        this.failDeck(
          deck,
          generation,
          `The ${VERSION_LABEL[deck.version]} file's duration could not be read. Try a different export.`,
        );
        return;
      }

      deck.info = {
        ...deck.info,
        duration,
        ready: true,
        loading: false,
        error: null,
      };

      if (deck.element.paused) {
        this.seekElementSafely(deck, 0);
      }

      this.refresh();
    };

    const onDurationChange = (): void => {
      if (!isCurrent() || !deck.info.ready) {
        return;
      }

      const duration = deck.element.duration;

      if (Number.isFinite(duration) && duration > 0 && duration !== deck.info.duration) {
        deck.info = { ...deck.info, duration };
        this.refresh();
      }
    };

    const onError = (): void => {
      if (!isCurrent()) {
        return;
      }

      this.failDeck(
        deck,
        generation,
        `The ${VERSION_LABEL[deck.version]} file could not be opened by your browser. Try another export or a different format.`,
      );
    };

    deck.element.addEventListener('loadedmetadata', onLoadedMetadata);
    deck.element.addEventListener('durationchange', onDurationChange);
    deck.element.addEventListener('error', onError);

    deck.loadCleanup = () => {
      deck.element.removeEventListener('loadedmetadata', onLoadedMetadata);
      deck.element.removeEventListener('durationchange', onDurationChange);
      deck.element.removeEventListener('error', onError);
      deck.loadCleanup = null;
    };
  }

  private cleanupLoad(deck: Deck): void {
    deck.loadCleanup?.();
  }

  private failDeck(deck: Deck, generation: number, message: string): void {
    if (deck.generation !== generation || this.disposed) {
      return;
    }

    this.haltPlayback();
    this.hasStarted = false;
    this.cleanupLoad(deck);
    deck.element.pause();
    deck.element.removeAttribute('src');
    deck.element.load();

    if (deck.url) {
      this.host.revokeObjectURL(deck.url);
      deck.url = null;
    }

    deck.info = {
      ...deck.info,
      duration: null,
      ready: false,
      loading: false,
      error: message,
    };

    this.snapshot = { ...this.snapshot, currentTime: 0 };
    this.emitTime(0);
    this.refresh();
  }

  private releaseDeckMedia(deck: Deck): void {
    this.cleanupLoad(deck);
    deck.element.pause();
    deck.element.removeAttribute('src');
    deck.element.load();

    if (deck.url) {
      this.host.revokeObjectURL(deck.url);
      deck.url = null;
    }
  }

  private listen(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler);
    this.lifecycleCleanup.push(() => target.removeEventListener(type, handler));
  }
}
