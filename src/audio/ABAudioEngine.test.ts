import { describe, expect, it } from 'vitest';
import { ABAudioEngine, DEFAULT_METADATA_TIMEOUT_MS } from './ABAudioEngine';
import { DEFAULT_CROSSFADE_MS, MAX_CROSSFADE_MS, MIN_CROSSFADE_MS } from './crossfade';
import { FakeAudioHost, flushMicrotasks, makeWavFile } from '../test/fakeAudioHost';

function setup(crossfadeMs?: number) {
  const host = new FakeAudioHost();
  const engine = new ABAudioEngine({
    host,
    ...(crossfadeMs === undefined ? {} : { crossfadeMs }),
  });
  return { host, engine };
}

async function loadBoth(
  host: FakeAudioHost,
  engine: ABAudioEngine,
  durations: { original: number; edited: number } = { original: 3, edited: 3 },
) {
  host.durationFor = (file) =>
    file.name.includes('edited') ? durations.edited : durations.original;
  engine.loadFile('original', makeWavFile('original.wav'));
  engine.loadFile('edited', makeWavFile('edited.wav'));
  await flushMicrotasks();
}

describe('ABAudioEngine', () => {
  it('starts empty', () => {
    const { engine } = setup();
    const snapshot = engine.getSnapshot();

    expect(snapshot.status).toBe('empty');
    expect(snapshot.isPlaying).toBe(false);
    expect(snapshot.original.ready).toBe(false);
    expect(snapshot.edited.ready).toBe(false);
    expect(snapshot.duration).toBe(0);
  });

  it('loading one file leaves the player incomplete', async () => {
    const { host, engine } = setup();
    host.durationFor = () => 3;
    engine.loadFile('original', makeWavFile('original.wav'));
    await flushMicrotasks();

    const snapshot = engine.getSnapshot();
    expect(snapshot.original.ready).toBe(true);
    expect(snapshot.edited.ready).toBe(false);
    expect(snapshot.status).toBe('incomplete');
    expect(snapshot.duration).toBe(0);
  });

  it('reaches ready with both valid files and reflects metadata', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine, { original: 3, edited: 3.4 });

    const snapshot = engine.getSnapshot();
    expect(snapshot.status).toBe('ready');
    expect(snapshot.original.ready).toBe(true);
    expect(snapshot.edited.ready).toBe(true);
    expect(snapshot.original.fileName).toBe('original.wav');
    expect(snapshot.edited.duration).toBeCloseTo(3.4, 5);
    expect(snapshot.duration).toBe(3);
    expect(snapshot.durationMismatch).toBe(true);
  });

  it('play resumes the AudioContext and starts both decks', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);

    await engine.play();

    expect(host.contexts).toHaveLength(1);
    expect(host.contexts[0]?.state).toBe('running');
    expect(host.elements[0]?.playAttempts).toBe(1);
    expect(host.elements[1]?.playAttempts).toBe(1);
    expect(engine.getSnapshot().status).toBe('playing');
    expect(engine.getSnapshot().isPlaying).toBe(true);
  });

  it('rolls back both decks and reports a rejected play()', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    host.rejectPlay = true;

    await engine.play();

    const snapshot = engine.getSnapshot();
    expect(snapshot.isPlaying).toBe(false);
    expect(snapshot.status).toBe('error');
    expect(snapshot.globalError).toMatch(/could not start/i);
    expect(host.elements[0]?.paused).toBe(true);
    expect(host.elements[1]?.paused).toBe(true);
  });

  it('pause pauses both decks', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();

    engine.pause();

    expect(host.elements[0]?.paused).toBe(true);
    expect(host.elements[1]?.paused).toBe(true);
    expect(engine.getSnapshot().isPlaying).toBe(false);
    expect(engine.getSnapshot().status).toBe('paused');
  });

  it('seek clamps and applies the target to both decks', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine, { original: 3, edited: 2.5 });
    await engine.play();

    engine.seek(999);
    expect(host.elements[0]?.currentTime).toBe(2.5);
    expect(host.elements[1]?.currentTime).toBe(2.5);
    expect(engine.getSnapshot().currentTime).toBe(2.5);

    engine.seek(-10);
    expect(host.elements[0]?.currentTime).toBe(0);
    expect(host.elements[1]?.currentTime).toBe(0);
    expect(engine.getSnapshot().currentTime).toBe(0);
  });

  it('keeps a paused seek when canplay fires again', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();
    engine.pause();

    engine.seek(1);

    // Browsers can re-fire canplay after a seek; it must not reset the deck.
    host.elements[0]?.dispatchEvent(new Event('canplay'));
    host.elements[1]?.dispatchEvent(new Event('canplay'));

    expect(host.elements[0]?.currentTime).toBeCloseTo(1, 5);
    expect(host.elements[1]?.currentTime).toBeCloseTo(1, 5);
    expect(engine.getSnapshot().currentTime).toBeCloseTo(1, 5);
  });

  it('switching while paused selects the deck used on resume', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);

    await engine.switchTo('edited');
    expect(engine.getSnapshot().activeVersion).toBe('edited');

    await engine.play();
    const context = host.contexts[0];

    expect(context?.gains[1]?.gain.value).toBe(0);
    expect(context?.gains[2]?.gain.value).toBe(1);
  });

  it('switching while playing schedules both gain ramps over 180 ms', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();

    await engine.switchTo('edited');

    const context = host.contexts[0];
    const originalRamps =
      context?.gains[1]?.gain.calls.filter((call) => call.method === 'linearRampToValueAtTime') ??
      [];
    const editedRamps =
      context?.gains[2]?.gain.calls.filter((call) => call.method === 'linearRampToValueAtTime') ??
      [];

    const originalOut = originalRamps.at(-1);
    const editedIn = editedRamps.at(-1);

    expect(originalOut?.value).toBe(0);
    expect(editedIn?.value).toBe(1);
    expect(originalOut).toBeDefined();
    expect(editedIn).toBeDefined();

    if (originalOut && editedIn) {
      expect(editedIn.time - originalOut.time).toBeCloseTo(0, 5);
    }
  });

  it('switching at a nonzero time does not reset the playhead', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();
    engine.seek(1.2);

    await engine.switchTo('edited');

    const snapshot = engine.getSnapshot();
    expect(snapshot.activeVersion).toBe('edited');
    expect(snapshot.currentTime).toBeCloseTo(1.2, 5);
    expect(host.elements[1]?.currentTime).toBeCloseTo(1.2, 5);
  });

  it('rapid switching leaves one coherent gain state', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();

    const first = engine.switchTo('edited');
    const second = engine.switchTo('original');
    await Promise.all([first, second]);

    const snapshot = engine.getSnapshot();
    const diagnostics = engine.getDeckDiagnostics();

    expect(snapshot.activeVersion).toBe('original');
    expect(diagnostics.original.gain).toBeGreaterThanOrEqual(0);
    expect(diagnostics.original.gain).toBeLessThanOrEqual(1);
    expect(diagnostics.edited.gain).toBeGreaterThanOrEqual(0);
    expect(diagnostics.edited.gain).toBeLessThanOrEqual(1);

    const context = host.contexts[0];
    const rampValues = [context?.gains[1], context?.gains[2]].flatMap(
      (gain) =>
        gain?.gain.calls
          .filter((call) => call.method === 'linearRampToValueAtTime')
          .map((call) => call.value) ?? [],
    );

    expect(rampValues.every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it('aligns the incoming deck before it becomes audible', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();
    engine.seek(1);

    host.elements[0]?.advance(0.2);
    await engine.switchTo('edited');

    const difference = Math.abs(
      (host.elements[1]?.currentTime ?? 0) - (host.elements[0]?.currentTime ?? 0),
    );

    expect(difference).toBeLessThanOrEqual(0.05);
    expect(engine.getSnapshot().activeVersion).toBe('edited');
  });

  it('keeps master volume independent of the active version', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();

    engine.setVolume(0.4);
    expect(host.contexts[0]?.gains[0]?.gain.value).toBe(0.4);

    await engine.switchTo('edited');
    expect(host.contexts[0]?.gains[0]?.gain.value).toBe(0.4);
    expect(engine.getSnapshot().volume).toBe(0.4);

    engine.setMuted(true);
    expect(host.contexts[0]?.gains[0]?.gain.value).toBe(0);
    engine.setMuted(false);
    expect(host.contexts[0]?.gains[0]?.gain.value).toBe(0.4);
  });

  it('removing either file pauses both decks and returns to incomplete', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();

    engine.removeFile('edited');

    const snapshot = engine.getSnapshot();
    expect(host.elements[0]?.paused).toBe(true);
    expect(host.elements[1]?.paused).toBe(true);
    expect(snapshot.isPlaying).toBe(false);
    expect(snapshot.status).toBe('incomplete');
    expect(snapshot.edited.fileName).toBeNull();
    expect(snapshot.original.ready).toBe(true);
    expect(host.revokedUrls).toHaveLength(1);
  });

  it('ignores stale load events from a replaced source', async () => {
    const { host, engine } = setup();
    host.durationFor = (file) => (file.name === 'b.wav' ? 5 : 3);

    engine.loadFile('original', makeWavFile('a.wav'));
    engine.loadFile('original', makeWavFile('b.wav'));
    await flushMicrotasks();

    const snapshot = engine.getSnapshot();
    expect(snapshot.original.fileName).toBe('b.wav');
    expect(snapshot.original.duration).toBe(5);
    expect(snapshot.original.ready).toBe(true);
  });

  it('stops at the common duration when the shorter deck ends', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine, { original: 3, edited: 2 });
    await engine.play();

    host.elements[1]?.dispatchEvent(new Event('ended'));

    const snapshot = engine.getSnapshot();
    expect(snapshot.isPlaying).toBe(false);
    expect(snapshot.status).toBe('paused');
    expect(snapshot.currentTime).toBe(2);
    expect(host.elements[0]?.paused).toBe(true);
    expect(host.elements[1]?.paused).toBe(true);
  });

  it('treats a pause at the common end as a normal finish', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine, { original: 3, edited: 2 });
    await engine.play();

    // Firefox pauses the element at its end before `ended` or the ticker runs.
    host.elements[1]?.advance(2);
    host.elements[0]?.advance(2);
    host.elements[1]?.dispatchEvent(new Event('pause'));

    const snapshot = engine.getSnapshot();
    expect(snapshot.isPlaying).toBe(false);
    expect(snapshot.interrupted).toBe(false);
    expect(snapshot.status).toBe('paused');
    expect(snapshot.currentTime).toBe(2);
  });

  it('playing after the end restarts both decks at zero', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine, { original: 3, edited: 2 });
    await engine.play();
    host.elements[1]?.dispatchEvent(new Event('ended'));

    await engine.play();

    expect(host.elements[0]?.currentTime).toBe(0);
    expect(host.elements[1]?.currentTime).toBe(0);
    expect(engine.getSnapshot().isPlaying).toBe(true);
  });

  it('dispose releases object URLs, listeners and is idempotent', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();

    engine.dispose();
    engine.dispose();

    expect(host.revokedUrls).toHaveLength(2);
    expect(host.elements.every((element) => element.paused)).toBe(true);
    expect(host.contexts[0]?.state).toBe('closed');

    const afterDispose = engine.getSnapshot();
    host.elements[0]?.dispatchEvent(new Event('ended'));
    expect(engine.getSnapshot()).toBe(afterDispose);
    expect(engine.loadFile('original', makeWavFile('late.wav')).ok).toBe(false);
  });

  it('rejects invalid files without disturbing the current selection', async () => {
    const { host, engine } = setup();
    host.durationFor = () => 3;
    engine.loadFile('original', makeWavFile('original.wav'));
    await flushMicrotasks();

    const result = engine.loadFile('original', makeWavFile('notes.txt', 120));

    expect(result.ok).toBe(false);
    expect(engine.getSnapshot().original.fileName).toBe('original.wav');
  });
});

describe('v0.2 transport hardening', () => {
  it('coalesces repeated Play requests into a single start', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);

    await Promise.all([engine.play(), engine.play(), engine.play()]);

    expect(host.elements[0]?.playAttempts).toBe(1);
    expect(host.elements[1]?.playAttempts).toBe(1);
    expect(engine.getSnapshot().status).toBe('playing');
    expect(engine.getSnapshot().isStarting).toBe(false);
  });

  it('reports a truthful starting state while the media start is pending', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    host.holdPlay();

    const pending = engine.play();
    await flushMicrotasks();

    expect(engine.getSnapshot().status).toBe('starting');
    expect(engine.getSnapshot().isStarting).toBe(true);
    expect(engine.getSnapshot().isPlaying).toBe(false);

    host.releasePlay();
    await pending;

    expect(engine.getSnapshot().status).toBe('playing');
    expect(engine.getSnapshot().isStarting).toBe(false);
  });

  it('pause during startup cancels the pending start', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    host.holdPlay();

    const pending = engine.play();
    await flushMicrotasks();
    engine.pause();
    host.releasePlay();
    await pending;

    const snapshot = engine.getSnapshot();
    expect(snapshot.isPlaying).toBe(false);
    expect(snapshot.isStarting).toBe(false);
    expect(snapshot.status).toBe('ready');
    expect(host.elements.every((element) => element.paused)).toBe(true);
  });

  it('replacing a file during startup supersedes the old start', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    host.holdPlay();

    const pending = engine.play();
    await flushMicrotasks();
    engine.loadFile('original', makeWavFile('replacement.wav'));
    host.releasePlay();
    await pending;
    await flushMicrotasks();

    const snapshot = engine.getSnapshot();
    expect(snapshot.isPlaying).toBe(false);
    expect(snapshot.original.fileName).toBe('replacement.wav');
    expect(snapshot.original.ready).toBe(true);
    expect(host.elements.every((element) => element.paused)).toBe(true);
  });

  it('removing a file during startup leaves the player incomplete', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    host.holdPlay();

    const pending = engine.play();
    await flushMicrotasks();
    engine.removeFile('original');
    host.releasePlay();
    await pending;
    await flushMicrotasks();

    const snapshot = engine.getSnapshot();
    expect(snapshot.isPlaying).toBe(false);
    expect(snapshot.status).toBe('incomplete');
    expect(snapshot.original.fileName).toBeNull();
    expect(host.elements.every((element) => element.paused)).toBe(true);
  });

  it('dispose during startup releases everything and never restarts media', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    host.holdPlay();

    const pending = engine.play();
    await flushMicrotasks();
    engine.dispose();
    host.releasePlay();
    await pending;

    expect(host.elements.every((element) => element.paused)).toBe(true);
    expect(host.contexts[0]?.state).toBe('closed');
    expect(engine.getSnapshot().isPlaying).toBe(false);
    expect(engine.loadFile('original', makeWavFile('late.wav')).ok).toBe(false);
  });

  it('pauses both decks when one play promise rejects after the other resolves', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    host.rejectPlayFor = (element) => element === host.elements[1];

    await engine.play();

    const snapshot = engine.getSnapshot();
    expect(snapshot.isPlaying).toBe(false);
    expect(snapshot.status).toBe('error');
    expect(host.elements[0]?.paused).toBe(true);
    expect(host.elements[1]?.paused).toBe(true);
  });

  it('shows a switching state while the target deck is still aligning', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();
    host.manualTimers = true;
    host.suppressSeeked = true;
    engine.seek(1);
    host.elements[0]?.advance(0.2);

    const switching = engine.switchTo('edited');
    await flushMicrotasks();

    const during = engine.getSnapshot();
    expect(during.status).toBe('switching');
    expect(during.switchingTo).toBe('edited');
    expect(during.activeVersion).toBe('edited');
    expect(during.audibleVersion).toBe('original');

    host.runTimeouts();
    await switching;

    const after = engine.getSnapshot();
    expect(after.switchingTo).toBeNull();
    expect(after.activeVersion).toBe('original');
    expect(after.audibleVersion).toBe('original');
    expect(after.globalError).toMatch(/could not be synchronized/i);
    expect(after.isPlaying).toBe(true);
  });

  it('seeking during an alignment-pending switch re-requests the same target', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();
    host.manualTimers = true;
    host.suppressSeeked = true;
    engine.seek(1);
    host.elements[0]?.advance(0.2);

    const switching = engine.switchTo('edited');
    await flushMicrotasks();
    engine.seek(2);
    await flushMicrotasks();

    const snapshot = engine.getSnapshot();
    expect(snapshot.activeVersion).toBe('edited');
    expect(snapshot.audibleVersion).toBe('edited');
    expect(snapshot.currentTime).toBeCloseTo(2, 5);
    expect(host.elements[0]?.currentTime).toBeCloseTo(2, 5);
    expect(host.elements[1]?.currentTime).toBeCloseTo(2, 5);

    host.runTimeouts();
    await switching;
    engine.pause();
  });

  it('a newer switch request wins over an unresolved alignment', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();
    host.manualTimers = true;
    host.suppressSeeked = true;
    engine.seek(1);
    host.elements[0]?.advance(0.3);

    const first = engine.switchTo('edited');
    await flushMicrotasks();
    const second = engine.switchTo('original');
    await second;

    const snapshot = engine.getSnapshot();
    expect(snapshot.activeVersion).toBe('original');
    expect(snapshot.audibleVersion).toBe('original');
    expect(snapshot.switchingTo).toBe('original');

    host.runTimeouts();
    await first;

    expect(engine.getSnapshot().activeVersion).toBe('original');
    engine.pause();
  });

  it('pause during an active fade settles on the target deck', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();

    await engine.switchTo('edited');
    expect(engine.getSnapshot().switchingTo).toBe('edited');

    engine.pause();

    const snapshot = engine.getSnapshot();
    expect(snapshot.status).toBe('paused');
    expect(snapshot.activeVersion).toBe('edited');
    expect(snapshot.audibleVersion).toBe('edited');
    expect(snapshot.switchingTo).toBeNull();
    expect(host.elements.every((element) => element.paused)).toBe(true);

    const diagnostics = engine.getDeckDiagnostics();
    expect(diagnostics.original.gain).toBeCloseTo(0, 5);
    expect(diagnostics.edited.gain).toBeCloseTo(1, 5);
  });

  it('seek during a fade keeps both decks aligned and the switch pending', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();
    await engine.switchTo('edited');

    engine.seek(1.5);

    const snapshot = engine.getSnapshot();
    expect(snapshot.currentTime).toBeCloseTo(1.5, 5);
    expect(host.elements[0]?.currentTime).toBeCloseTo(1.5, 5);
    expect(host.elements[1]?.currentTime).toBeCloseTo(1.5, 5);
    expect(snapshot.switchingTo).toBe('edited');
    expect(snapshot.activeVersion).toBe('edited');

    engine.pause();
  });

  it('rebases a reversed fade from the interpolated gains', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();

    await engine.switchTo('edited');
    const context = host.contexts[0];
    expect(context).toBeDefined();

    if (!context) {
      return;
    }

    context.currentTime = 0.095;
    await engine.switchTo('original');

    const originalCalls = context.gains[1]?.gain.calls ?? [];
    const editedCalls = context.gains[2]?.gain.calls ?? [];
    const originalRamp = originalCalls
      .filter((call) => call.method === 'linearRampToValueAtTime')
      .at(-1);
    const editedRamp = editedCalls
      .filter((call) => call.method === 'linearRampToValueAtTime')
      .at(-1);
    const originalStart = originalCalls.filter((call) => call.method === 'setValueAtTime').at(-1);
    const editedStart = editedCalls.filter((call) => call.method === 'setValueAtTime').at(-1);

    expect(originalRamp?.value).toBe(1);
    expect(editedRamp?.value).toBe(0);
    expect(originalStart?.value).toBeGreaterThan(0.4);
    expect(originalStart?.value).toBeLessThan(0.6);
    expect(editedStart?.value).toBeCloseTo(1 - (originalStart?.value ?? 0), 5);

    engine.pause();
  });

  it('clamps the adjustable crossfade duration', () => {
    const { engine } = setup();
    expect(engine.getSnapshot().crossfadeMs).toBe(DEFAULT_CROSSFADE_MS);

    engine.setCrossfadeMs(10);
    expect(engine.getSnapshot().crossfadeMs).toBe(MIN_CROSSFADE_MS);

    engine.setCrossfadeMs(900);
    expect(engine.getSnapshot().crossfadeMs).toBe(MAX_CROSSFADE_MS);

    engine.setCrossfadeMs(Number.NaN);
    expect(engine.getSnapshot().crossfadeMs).toBe(DEFAULT_CROSSFADE_MS);

    engine.setCrossfadeMs(240);
    expect(engine.getSnapshot().crossfadeMs).toBe(240);
  });

  it('keeps the current fade unchanged when the duration changes mid-fade', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();
    await engine.switchTo('edited');

    const context = host.contexts[0];
    const scheduledEnd = context?.gains[2]?.gain.calls
      .filter((call) => call.method === 'linearRampToValueAtTime')
      .at(-1)?.time;

    engine.setCrossfadeMs(600);

    const unchangedEnd = context?.gains[2]?.gain.calls
      .filter((call) => call.method === 'linearRampToValueAtTime')
      .at(-1)?.time;

    expect(engine.getSnapshot().crossfadeMs).toBe(600);
    expect(unchangedEnd).toBe(scheduledEnd);

    await engine.switchTo('original');
    const calls = context?.gains[1]?.gain.calls ?? [];
    const ramp = calls.filter((call) => call.method === 'linearRampToValueAtTime').at(-1);
    const hold = calls.filter((call) => call.method === 'setValueAtTime').at(-1);

    expect(ramp && hold ? ramp.time - hold.time : 0).toBeCloseTo(0.6, 3);

    engine.pause();
  });

  it('recovers from an unexpected context suspension without auto-playing', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();
    host.elements[0]?.advance(1.25);

    const context = host.contexts[0];
    expect(context).toBeDefined();
    context?.setState('suspended');

    const interrupted = engine.getSnapshot();
    expect(interrupted.status).toBe('interrupted');
    expect(interrupted.interrupted).toBe(true);
    expect(interrupted.isPlaying).toBe(false);
    expect(interrupted.currentTime).toBeCloseTo(1.25, 5);
    expect(host.elements.every((element) => element.paused)).toBe(true);

    const diagnostics = engine.getDeckDiagnostics();
    expect(diagnostics.original.gain).toBeCloseTo(1, 5);
    expect(diagnostics.edited.gain).toBeCloseTo(0, 5);

    await engine.play();

    expect(context?.state).toBe('running');
    expect(engine.getSnapshot().status).toBe('playing');
    expect(engine.getSnapshot().interrupted).toBe(false);
    expect(host.elements.every((element) => !element.paused)).toBe(true);
  });

  it('treats an interrupted context state like a suspension', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();

    host.contexts[0]?.setState('interrupted');

    expect(engine.getSnapshot().status).toBe('interrupted');
    expect(engine.getSnapshot().interrupted).toBe(true);
    expect(host.elements.every((element) => element.paused)).toBe(true);
  });

  it('surfaces a closed context as an actionable error', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();

    host.contexts[0]?.setState('closed');

    const closed = engine.getSnapshot();
    expect(closed.status).toBe('error');
    expect(closed.isPlaying).toBe(false);
    expect(closed.globalError).toMatch(/no longer available/i);
    expect(host.elements.every((element) => element.paused)).toBe(true);

    await engine.play();
    expect(engine.getSnapshot().status).toBe('error');
    expect(engine.getSnapshot().globalError).toMatch(/no longer available/i);
  });

  it('reconciles when the browser pauses one media deck', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine);
    await engine.play();

    host.elements[1]?.pause();

    const snapshot = engine.getSnapshot();
    expect(snapshot.status).toBe('interrupted');
    expect(snapshot.isPlaying).toBe(false);
    expect(snapshot.audibleVersion).toBe('original');
    expect(host.elements.every((element) => element.paused)).toBe(true);
  });

  it('waits for a late duration instead of failing the first metadata event', async () => {
    const { host, engine } = setup();
    host.durationFor = (file) => (file.name.includes('edited') ? 3 : Number.NaN);

    engine.loadFile('original', makeWavFile('original.wav'));
    engine.loadFile('edited', makeWavFile('edited.wav'));
    await flushMicrotasks();

    expect(engine.getSnapshot().original.loading).toBe(true);
    expect(engine.getSnapshot().original.ready).toBe(false);

    host.elements[0]?.publishDuration(4);

    const snapshot = engine.getSnapshot();
    expect(snapshot.original.ready).toBe(true);
    expect(snapshot.original.loading).toBe(false);
    expect(snapshot.original.duration).toBe(4);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.duration).toBe(3);
  });

  it('fails a never-loading file after the metadata timeout', async () => {
    const { host, engine } = setup();
    host.manualTimers = true;
    host.durationFor = () => 3;
    host.shouldNeverLoad = (file) => file.name.includes('stuck');

    engine.loadFile('original', makeWavFile('stuck.wav'));
    engine.loadFile('edited', makeWavFile('edited.wav'));
    await flushMicrotasks();

    expect(engine.getSnapshot().original.loading).toBe(true);
    expect(host.pendingTimeoutCount).toBeGreaterThan(0);

    host.runTimeouts();

    const snapshot = engine.getSnapshot();
    expect(snapshot.original.loading).toBe(false);
    expect(snapshot.original.ready).toBe(false);
    expect(snapshot.original.error).toMatch(/took too long/i);
    expect(snapshot.status).toBe('error');
    expect(host.pendingTimeoutCount).toBe(0);
  });

  it('cancels metadata timeouts on success, replacement, removal and dispose', async () => {
    const successHost = new FakeAudioHost();
    successHost.manualTimers = true;
    successHost.durationFor = () => 3;
    const successEngine = new ABAudioEngine({ host: successHost });
    successEngine.loadFile('original', makeWavFile('ok.wav'));
    await flushMicrotasks();
    expect(successHost.pendingTimeoutCount).toBe(0);

    const replaceHost = new FakeAudioHost();
    replaceHost.manualTimers = true;
    replaceHost.durationFor = () => 3;
    replaceHost.shouldNeverLoad = (file) => file.name.includes('stuck');
    const replaceEngine = new ABAudioEngine({ host: replaceHost });
    replaceEngine.loadFile('original', makeWavFile('stuck.wav'));
    replaceEngine.loadFile('original', makeWavFile('replacement.wav'));
    await flushMicrotasks();
    expect(replaceHost.pendingTimeoutCount).toBe(0);
    expect(replaceEngine.getSnapshot().original.fileName).toBe('replacement.wav');

    const removeHost = new FakeAudioHost();
    removeHost.manualTimers = true;
    removeHost.durationFor = () => 3;
    removeHost.shouldNeverLoad = () => true;
    const removeEngine = new ABAudioEngine({ host: removeHost });
    removeEngine.loadFile('original', makeWavFile('stuck.wav'));
    removeEngine.removeFile('original');
    expect(removeHost.pendingTimeoutCount).toBe(0);

    const disposeHost = new FakeAudioHost();
    disposeHost.manualTimers = true;
    disposeHost.durationFor = () => 3;
    disposeHost.shouldNeverLoad = () => true;
    const disposeEngine = new ABAudioEngine({ host: disposeHost });
    disposeEngine.loadFile('original', makeWavFile('stuck.wav'));
    disposeEngine.dispose();
    expect(disposeHost.pendingTimeoutCount).toBe(0);
  });

  it('uses a documented default metadata timeout', () => {
    expect(DEFAULT_METADATA_TIMEOUT_MS).toBe(15_000);
  });

  it('clamps the playhead when a duration changes after readiness', async () => {
    const { host, engine } = setup();
    await loadBoth(host, engine, { original: 3, edited: 3 });
    await engine.play();
    engine.seek(2.8);

    host.elements[0]?.publishDuration(2);

    const snapshot = engine.getSnapshot();
    expect(snapshot.duration).toBe(2);
    expect(snapshot.currentTime).toBeCloseTo(2, 5);
    expect(host.elements[0]?.currentTime).toBeCloseTo(2, 5);
    expect(host.elements[1]?.currentTime).toBeCloseTo(2, 5);

    engine.pause();
  });

  it('survives repeated replace/remove cycles without leaking URLs', async () => {
    const { host, engine } = setup();
    host.durationFor = () => 2;

    for (let index = 0; index < 20; index += 1) {
      engine.loadFile('original', makeWavFile(`take-${index}.wav`));
      await flushMicrotasks();
      engine.removeFile('original');
    }

    expect(host.createdUrls).toHaveLength(20);
    expect(host.revokedUrls).toHaveLength(20);
    expect(engine.getSnapshot().original.fileName).toBeNull();
    expect(host.pendingTimeoutCount).toBe(0);
  });
});
