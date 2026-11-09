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
  clampCrossfadeMs,
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

/**
 * Local metadata reads normally resolve in well under a second. This bound is
 * deliberately generous for large local files while still preventing a corrupt
 * or unsupported container from leaving the slot loading forever.
 */
export const DEFAULT_METADATA_TIMEOUT_MS = 15_000;

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
  metadataTimeout: number | null;
  playAttempts: number;
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
  private readonly logger: (message: string, details?: unknown) => void;
  private readonly metadataTimeoutMs: number;
  private readonly decks: Record<AudioVersion, Deck>;
  private readonly listeners = new Set<() => void>();
  private readonly timeListeners = new Set<(time: number) => void>();
  private readonly lifecycleCleanup: ListenCleanup[] = [];

  private snapshot: ABPlayerSnapshot;
  private audioContext: AudioContextLike | null = null;
  private masterGain: GainNodeLike | null = null;
  private crossfadeMs: number;
  private activeVersion: AudioVersion = 'original';
  private audibleVersion: AudioVersion = 'original';
  private switchingTo: AudioVersion | null = null;
  private interrupted = false;
  private isPlaying = false;
  private isStarting = false;
  private hasStarted = false;
  private frameHandle: number | null = null;
  private playSequence = 0;
  private switchSequence = 0;
  private switchCompletionHandle: number | null = null;
  private disposed = false;

  constructor(options: AudioEngineOptions = {}) {
    this.host = options.host ?? createBrowserAudioHost();
    this.crossfadeMs = clampCrossfadeMs(options.crossfadeMs ?? DEFAULT_CROSSFADE_MS);
    this.metadataTimeoutMs =
      typeof options.metadataTimeoutMs === 'number' &&
      Number.isFinite(options.metadataTimeoutMs) &&
      options.metadataTimeoutMs > 0
        ? options.metadataTimeoutMs
        : DEFAULT_METADATA_TIMEOUT_MS;
    this.logger = options.logger ?? (() => undefined);

    this.decks = {
      original: this.createDeck('original'),
      edited: this.createDeck('edited'),
    };

    this.snapshot = {
      status: 'empty',
      activeVersion: 'original',
      audibleVersion: 'original',
      switchingTo: null,
      isPlaying: false,
      isStarting: false,
      interrupted: false,
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

    if (typeof document !== 'undefined') {
      this.listen(document, 'visibilitychange', () => this.handleVisibilityChange());
    }

    if (typeof window !== 'undefined') {
      this.listen(window, 'pageshow', () => this.handlePageRestore());
      this.listen(window, 'pagehide', () => this.handlePageHide());
    }
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

    this.invalidateTransport();
    this.settleOnAudibleVersion();
    this.haltPlayback();
    this.hasStarted = false;
    this.releaseDeckMedia(deck);

    // Mark the slot as loading before seeking the surviving deck, so the
    // released element is never treated as a ready seek target.
    deck.info = { ...deck.info, duration: null, ready: false, loading: true, error: null };
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
    this.interrupted = false;
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

    const deck = this.decks[version];
    const other = this.decks[this.otherVersion(version)];

    this.invalidateTransport();
    this.settleOnAudibleVersion();

    if (this.activeVersion === version) {
      this.activeVersion = other.version;
    }

    if (this.audibleVersion === version) {
      this.audibleVersion = this.activeVersion;
    }

    this.haltPlayback();
    this.hasStarted = false;

    this.releaseDeckMedia(deck);
    deck.generation += 1;
    deck.info = emptyDeckInfo();

    if (other.info.ready) {
      this.seekElementSafely(other, 0);
    }

    this.snapshot = { ...this.snapshot, currentTime: 0, globalError: null };
    this.interrupted = false;
    this.emitTime(0);
    this.refresh();
  }

  // ---------------------------------------------------------------------------
  // Transport
  // ---------------------------------------------------------------------------

  async play(): Promise<void> {
    if (this.disposed || this.isPlaying || this.isStarting || !this.bothReady()) {
      return;
    }

    const sequence = ++this.playSequence;
    this.isStarting = true;
    this.interrupted = false;
    this.snapshot = { ...this.snapshot, globalError: null };
    this.refresh();

    try {
      const context = this.ensureGraph();

      if (context.state === 'suspended' || context.state === 'interrupted') {
        await context.resume();
      }

      if (!this.isCurrentPlay(sequence)) {
        if (!this.isPlaying) {
          this.pauseBothDecks();
        }
        return;
      }

      if (context.state !== 'running') {
        throw new Error('AudioContext is not running');
      }

      if (
        isValidDuration(this.snapshot.duration) &&
        this.snapshot.currentTime >= this.snapshot.duration - END_TOLERANCE_SECONDS
      ) {
        this.applySeek(0, false);
      }

      this.applyGainsImmediate();

      const active = this.decks[this.activeVersion];
      const inactive = this.decks[this.otherVersion(this.activeVersion)];

      active.playAttempts += 1;
      inactive.playAttempts += 1;

      await Promise.all([active.element.play(), inactive.element.play()]);

      if (!this.isCurrentPlay(sequence)) {
        // A Pause/Replace/Remove/Dispose superseded this start. Make sure a
        // late-resolving play promise cannot leave media running underneath.
        if (!this.isPlaying) {
          this.pauseBothDecks();
        }
        return;
      }

      this.isStarting = false;
      this.isPlaying = true;
      this.hasStarted = true;
      this.interrupted = false;
      this.syncDeckTo(active, inactive);
      this.startTicker();
      this.refresh();
      this.emitTime(this.readPlayhead());
    } catch (error) {
      this.logger('playback failed', error);

      if (!this.isCurrentPlay(sequence)) {
        return;
      }

      this.isStarting = false;
      this.haltPlayback();
      this.snapshot = {
        ...this.snapshot,
        globalError:
          this.audioContext?.state === 'closed'
            ? 'Audio output is no longer available. Reload the page to continue.'
            : 'Audio could not start. Press Play again to retry.',
      };
      this.refresh();
    }
  }

  pause(): void {
    if (this.disposed) {
      return;
    }

    const time =
      this.isPlaying || this.isStarting ? this.readPlayhead() : this.snapshot.currentTime;

    this.playSequence += 1;
    this.switchSequence += 1;
    this.isStarting = false;
    this.cancelSwitchCompletion();

    // A pause during an alignment-pending switch settles on the deck that was
    // actually audible, not on a target that never started fading in.
    if (this.switchingTo && this.audibleVersion !== this.switchingTo) {
      this.activeVersion = this.audibleVersion;
    }

    this.switchingTo = null;
    this.interrupted = false;
    this.haltPlayback();
    this.snapshot = { ...this.snapshot, currentTime: time };
    this.emitTime(time);
    this.refresh();
  }

  seek(seconds: number): void {
    if (this.disposed) {
      return;
    }

    const pendingTarget = this.switchingTo;
    const pendingAlignment =
      pendingTarget !== null && this.isPlaying && this.audibleVersion !== pendingTarget;

    if (pendingAlignment) {
      // The playhead moved before the incoming deck finished aligning. Cancel
      // that alignment, keep the audible deck coherent, then re-request the
      // same target at the new position.
      this.switchSequence += 1;
      this.cancelSwitchCompletion();
      this.switchingTo = null;
      this.activeVersion = this.audibleVersion;
      this.refresh();
    }

    this.applySeek(seconds, true);

    if (pendingAlignment && pendingTarget) {
      void this.requestSwitch(pendingTarget);
    }
  }

  async switchTo(version: AudioVersion): Promise<void> {
    if (this.disposed || !this.bothReady()) {
      return;
    }

    if (version === this.activeVersion && this.switchingTo === null) {
      return;
    }

    if (!this.isPlaying) {
      this.switchSequence += 1;
      this.cancelSwitchCompletion();
      this.activeVersion = version;
      this.audibleVersion = version;
      this.switchingTo = null;
      this.interrupted = false;
      this.snapshot = { ...this.snapshot, globalError: null };
      this.applyGainsImmediate();
      this.refresh();
      return;
    }

    await this.requestSwitch(version);
  }

  setCrossfadeMs(value: number): void {
    if (this.disposed) {
      return;
    }

    const next = clampCrossfadeMs(value);

    if (next === this.crossfadeMs) {
      return;
    }

    // Policy: a fade already in progress completes at its scheduled duration;
    // the new value applies to the next switch.
    this.crossfadeMs = next;
    this.refresh();
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
    {
      currentTime: number;
      paused: boolean;
      gain: number;
      ready: boolean;
      playAttempts: number;
    }
  > {
    const now = this.audioContext?.currentTime ?? 0;
    const targets = crossfadeTargets(this.activeVersion);

    return {
      original: {
        currentTime: this.decks.original.element.currentTime,
        paused: this.decks.original.element.paused,
        gain: this.decks.original.gain
          ? this.currentGain(this.decks.original, now)
          : targets.original,
        ready: this.decks.original.info.ready,
        playAttempts: this.decks.original.playAttempts,
      },
      edited: {
        currentTime: this.decks.edited.element.currentTime,
        paused: this.decks.edited.element.paused,
        gain: this.decks.edited.gain ? this.currentGain(this.decks.edited, now) : targets.edited,
        ready: this.decks.edited.info.ready,
        playAttempts: this.decks.edited.playAttempts,
      },
    };
  }

  /** Development-only diagnostic access to the lazily created audio context. */
  getAudioContext(): AudioContextLike | null {
    return this.audioContext;
  }

  dispose = (): void => {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.playSequence += 1;
    this.switchSequence += 1;
    this.cancelSwitchCompletion();
    this.stopTicker();
    this.isPlaying = false;
    this.isStarting = false;
    this.switchingTo = null;

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
      metadataTimeout: null,
      playAttempts: 0,
      info: emptyDeckInfo(),
    };

    this.listen(deck.element, 'ended', () => this.handleEnded(deck));
    this.listen(deck.element, 'pause', () => this.handleMediaPause(deck));
    this.listen(deck.element, 'playing', () => this.handleMediaPlaying(deck));

    return deck;
  }

  private otherVersion(version: AudioVersion): AudioVersion {
    return version === 'original' ? 'edited' : 'original';
  }

  private bothReady(): boolean {
    return this.decks.original.info.ready && this.decks.edited.info.ready;
  }

  private readPlayhead(): number {
    const version = this.isPlaying ? this.audibleVersion : this.activeVersion;
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
      return this.switchingTo ? 'switching' : 'playing';
    }

    if (this.isStarting) {
      return 'starting';
    }

    if (this.interrupted) {
      return 'interrupted';
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
      activeVersion: this.activeVersion,
      audibleVersion: this.audibleVersion,
      switchingTo: this.switchingTo,
      isPlaying: this.isPlaying,
      isStarting: this.isStarting,
      interrupted: this.interrupted,
      currentTime,
      duration,
      durationMismatch,
      crossfadeMs: this.crossfadeMs,
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

    const targets = crossfadeTargets(this.activeVersion);

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

    const onStateChange = (): void => this.handleContextStateChange();
    context.addEventListener?.('statechange', onStateChange);
    this.lifecycleCleanup.push(() => context.removeEventListener?.('statechange', onStateChange));

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

    this.audibleVersion = this.activeVersion;
    const now = this.audioContext.currentTime;
    const targets = crossfadeTargets(this.activeVersion);

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
    const plan = planCrossfade(this.activeVersion, currentGains, startTime, durationSeconds);

    for (const version of ['original', 'edited'] as const) {
      const deck = this.decks[version];

      if (deck.gain) {
        deck.ramp = applyGainRamp(deck.gain.gain, plan[version]);
      }
    }
  }

  private scheduleSwitchCompletion(sequence: number): void {
    this.cancelSwitchCompletion();

    const handle = this.host.setTimeout(
      () => {
        if (this.disposed || sequence !== this.switchSequence) {
          return;
        }

        this.switchCompletionHandle = null;
        this.switchingTo = null;
        this.refresh();
      },
      this.crossfadeMs + GAIN_SCHEDULE_LEAD_SECONDS * 1000,
    );

    this.switchCompletionHandle = handle;
  }

  private cancelSwitchCompletion(): void {
    if (this.switchCompletionHandle !== null) {
      this.host.clearTimeout(this.switchCompletionHandle);
      this.switchCompletionHandle = null;
    }
  }

  private haltPlayback(): void {
    this.stopTicker();
    this.isPlaying = false;
    this.isStarting = false;
    this.switchingTo = null;
    this.cancelSwitchCompletion();
    this.pauseBothDecks();
    this.applyGainsImmediate();
  }

  private pauseBothDecks(): void {
    this.decks.original.element.pause();
    this.decks.edited.element.pause();
  }

  private invalidateTransport(): void {
    this.playSequence += 1;
    this.switchSequence += 1;
    this.isStarting = false;
    this.switchingTo = null;
    this.cancelSwitchCompletion();
  }

  private settleOnAudibleVersion(): void {
    this.activeVersion = this.audibleVersion;
  }

  private isCurrentPlay(sequence: number): boolean {
    return !this.disposed && sequence === this.playSequence && this.isStarting;
  }

  private isCurrentSwitch(sequence: number): boolean {
    return !this.disposed && sequence === this.switchSequence && this.isPlaying;
  }

  private async requestSwitch(version: AudioVersion): Promise<void> {
    if (this.disposed || !this.bothReady() || !this.isPlaying) {
      return;
    }

    const sequence = ++this.switchSequence;
    const previousAudible = this.audibleVersion;
    const canonicalTime = this.readPlayhead();

    this.activeVersion = version;
    this.switchingTo = version;
    this.interrupted = false;
    this.snapshot = { ...this.snapshot, globalError: null };
    this.refresh();

    const target = this.decks[version];
    const aligned = await this.ensureAligned(target, canonicalTime, sequence);

    if (!this.isCurrentSwitch(sequence)) {
      return;
    }

    if (!aligned) {
      this.rollbackSwitch(
        previousAudible,
        sequence,
        'The selected version could not be synchronized. Playback stayed on the current version.',
      );
      return;
    }

    if (target.element.paused) {
      try {
        target.playAttempts += 1;
        await target.element.play();
      } catch (error) {
        this.logger('deck restart failed', error);

        if (this.isCurrentSwitch(sequence)) {
          this.rollbackSwitch(
            previousAudible,
            sequence,
            'The selected version could not start. Playback stayed on the current version.',
          );
        }

        return;
      }
    }

    if (!this.isCurrentSwitch(sequence)) {
      return;
    }

    // The audible deck kept advancing while the target aligned. Re-check the
    // drift right before the fade so a slow seek cannot produce a jump.
    const now = this.readPlayhead();

    if (Math.abs(target.element.currentTime - now) > SYNC_TOLERANCE_SECONDS) {
      const realigned = await this.ensureAligned(target, now, sequence);

      if (!this.isCurrentSwitch(sequence)) {
        return;
      }

      if (!realigned) {
        this.rollbackSwitch(
          previousAudible,
          sequence,
          'The selected version could not be synchronized. Playback stayed on the current version.',
        );
        return;
      }
    }

    this.audibleVersion = version;
    this.scheduleFade();
    this.scheduleSwitchCompletion(sequence);
    this.refresh();
  }

  private rollbackSwitch(previousAudible: AudioVersion, sequence: number, message: string): void {
    if (!this.isCurrentSwitch(sequence)) {
      return;
    }

    this.cancelSwitchCompletion();
    this.switchingTo = null;
    this.activeVersion = previousAudible;
    this.audibleVersion = previousAudible;
    this.snapshot = { ...this.snapshot, globalError: message };
    this.applyGainsImmediate();
    this.refresh();
  }

  private handleEnded(deck: Deck): void {
    if (!this.isPlaying || !isValidDuration(this.snapshot.duration)) {
      return;
    }

    const deckDuration = deck.info.duration;
    const isCommonEnd =
      isValidDuration(deckDuration) && Math.abs(deckDuration - this.snapshot.duration) < 0.05;

    if (isCommonEnd || deck.version === this.audibleVersion) {
      this.finishPlayback();
    }
  }

  private finishPlayback(): void {
    const endTime = this.snapshot.duration;
    this.haltPlayback();
    this.activeVersion = this.audibleVersion;
    this.snapshot = { ...this.snapshot, currentTime: endTime };
    this.emitTime(endTime);
    this.refresh();
  }

  private handleMediaPause(deck: Deck): void {
    if (this.disposed || !this.isPlaying) {
      return;
    }

    // A media element pauses itself when it reaches the end, and that pause
    // event can arrive before the ticker or `ended` observes the end. Treat it
    // as a normal finish rather than a device interruption.
    if (this.isAtPlaybackEnd()) {
      this.finishPlayback();
      return;
    }

    // Our own pause paths set isPlaying=false before pausing the elements, so a
    // pause event here means the browser or OS interrupted playback.
    this.logger(`media pause interrupted ${deck.version}`);
    this.reconcileInterruption();
  }

  private isAtPlaybackEnd(): boolean {
    const duration = this.snapshot.duration;

    return isValidDuration(duration) && this.readPlayhead() >= duration - END_TOLERANCE_SECONDS;
  }

  private handleMediaPlaying(deck: Deck): void {
    if (this.disposed) {
      return;
    }

    if (!this.isPlaying && !this.isStarting) {
      // A late play() continuation must not leave media running after the user
      // paused, replaced or removed the file.
      deck.element.pause();
    }
  }

  private handleContextStateChange(): void {
    if (this.disposed || !this.audioContext) {
      return;
    }

    const state = this.audioContext.state;

    if (state === 'running') {
      if (this.isPlaying) {
        this.startTicker();
      }
      return;
    }

    if (state === 'closed') {
      this.invalidateTransport();
      this.settleOnAudibleVersion();
      this.haltPlayback();
      this.interrupted = false;
      this.snapshot = {
        ...this.snapshot,
        globalError: 'Audio output is no longer available. Reload the page to continue.',
      };
      this.refresh();
      return;
    }

    if (this.isPlaying || this.isStarting) {
      this.reconcileInterruption();
    }
  }

  private reconcileInterruption(): void {
    const time = this.readPlayhead();

    this.playSequence += 1;
    this.switchSequence += 1;
    this.isStarting = false;
    this.isPlaying = false;
    this.switchingTo = null;
    this.cancelSwitchCompletion();
    this.activeVersion = this.audibleVersion;
    this.stopTicker();
    this.pauseBothDecks();
    this.applyGainsImmediate();
    this.interrupted = true;
    this.snapshot = { ...this.snapshot, globalError: null, currentTime: time };
    this.emitTime(time);
    this.refresh();
  }

  private handleVisibilityChange(): void {
    if (this.disposed || typeof document === 'undefined') {
      return;
    }

    if (document.hidden) {
      if (this.isPlaying) {
        this.emitTime(this.readPlayhead());
        this.stopTicker();
      }
      return;
    }

    if (this.isPlaying) {
      this.startTicker();
      this.emitTime(this.readPlayhead());
    }
  }

  private handlePageRestore(): void {
    if (this.disposed || !this.isPlaying) {
      return;
    }

    this.startTicker();
    this.emitTime(this.readPlayhead());
  }

  private handlePageHide(): void {
    if (this.disposed || !this.isPlaying) {
      return;
    }

    this.emitTime(this.readPlayhead());
    this.stopTicker();
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

  private async ensureAligned(deck: Deck, time: number, sequence?: number): Promise<boolean> {
    if (sequence !== undefined && !this.isCurrentSwitch(sequence)) {
      return false;
    }

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
        this.host.clearTimeout(timeout);
        resolve(value);
      };

      const onSeeked = (): void => finish(true);

      deck.element.addEventListener('seeked', onSeeked);
      timeout = this.host.setTimeout(() => finish(false), SYNC_WAIT_TIMEOUT_MS);

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

    const settleReady = (): boolean => {
      if (!isCurrent()) {
        return false;
      }

      const duration = deck.element.duration;

      if (!isValidDuration(duration)) {
        return false;
      }

      const wasReady = deck.info.ready;

      this.clearDeckTimeout(deck);
      deck.info = {
        ...deck.info,
        duration,
        ready: true,
        loading: false,
        error: null,
      };

      // `canplay` can fire again after a seek. Only reset a freshly loaded
      // deck to zero; otherwise a paused seek would be undone immediately.
      if (!wasReady && deck.element.paused) {
        this.seekElementSafely(deck, 0);
      }

      this.refresh();
      this.clampAfterDurationChange();
      return true;
    };

    const onLoadedMetadata = (): void => {
      settleReady();
    };

    const onDurationChange = (): void => {
      if (!isCurrent()) {
        return;
      }

      const duration = deck.element.duration;

      if (!isValidDuration(duration)) {
        return;
      }

      if (!deck.info.ready) {
        settleReady();
        return;
      }

      if (duration !== deck.info.duration) {
        deck.info = { ...deck.info, duration };
        this.refresh();
        this.clampAfterDurationChange();
      }
    };

    const onCanPlay = (): void => {
      settleReady();
    };

    const onError = (): void => {
      if (!isCurrent()) {
        return;
      }

      this.failDeck(deck, generation, this.describeMediaError(deck));
    };

    deck.element.addEventListener('loadedmetadata', onLoadedMetadata);
    deck.element.addEventListener('durationchange', onDurationChange);
    deck.element.addEventListener('canplay', onCanPlay);
    deck.element.addEventListener('error', onError);

    deck.loadCleanup = () => {
      deck.element.removeEventListener('loadedmetadata', onLoadedMetadata);
      deck.element.removeEventListener('durationchange', onDurationChange);
      deck.element.removeEventListener('canplay', onCanPlay);
      deck.element.removeEventListener('error', onError);
      deck.loadCleanup = null;
    };

    deck.metadataTimeout = this.host.setTimeout(() => {
      if (!isCurrent() || !deck.info.loading) {
        return;
      }

      this.failDeck(
        deck,
        generation,
        `The ${VERSION_LABEL[deck.version]} file took too long to read. Try a smaller export or a different format.`,
      );
    }, this.metadataTimeoutMs);
  }

  private describeMediaError(deck: Deck): string {
    const label = VERSION_LABEL[deck.version];
    const code = deck.element.error?.code;

    if (code === 3 || code === 4) {
      return `The ${label} file could not be opened by your browser because it could not be decoded. Try exporting it as WAV or MP3.`;
    }

    if (code === 2) {
      return `The ${label} file could not be read. Check that the file is still available and try again.`;
    }

    return `The ${label} file could not be opened by your browser. Try another export or a different format.`;
  }

  private clampAfterDurationChange(): void {
    if (!isValidDuration(this.snapshot.duration)) {
      return;
    }

    const target = this.snapshot.duration;
    let clamped = false;

    for (const version of ['original', 'edited'] as const) {
      const deck = this.decks[version];

      if (deck.info.ready && deck.element.currentTime > target + END_TOLERANCE_SECONDS) {
        this.seekElementSafely(deck, target);
        clamped = true;
      }
    }

    if (clamped || this.snapshot.currentTime > target) {
      this.snapshot = { ...this.snapshot, currentTime: target };
      this.emitTime(target);
    }
  }

  private clearDeckTimeout(deck: Deck): void {
    if (deck.metadataTimeout !== null) {
      this.host.clearTimeout(deck.metadataTimeout);
      deck.metadataTimeout = null;
    }
  }

  private cleanupLoad(deck: Deck): void {
    deck.loadCleanup?.();
    this.clearDeckTimeout(deck);
  }

  private failDeck(deck: Deck, generation: number, message: string): void {
    if (deck.generation !== generation || this.disposed) {
      return;
    }

    const time = this.readPlayhead();

    this.playSequence += 1;
    this.switchSequence += 1;
    this.isStarting = false;
    this.switchingTo = null;
    this.cancelSwitchCompletion();

    if (this.activeVersion === deck.version) {
      this.activeVersion = this.otherVersion(deck.version);
    }

    if (this.audibleVersion === deck.version) {
      this.audibleVersion = this.activeVersion;
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

    const clamped = isValidDuration(this.snapshot.duration)
      ? clampSeek(time, this.snapshot.duration)
      : 0;

    this.snapshot = { ...this.snapshot, currentTime: clamped, globalError: null };
    this.emitTime(clamped);
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
