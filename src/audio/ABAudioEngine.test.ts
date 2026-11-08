import { describe, expect, it } from 'vitest';
import { ABAudioEngine } from './ABAudioEngine';
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
    expect(snapshot.globalError).toMatch(/blocked audio playback/i);
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
