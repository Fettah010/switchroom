import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  editedInput,
  ensureComparisonEditor,
  fixturePath,
  loadPair,
  originalInput,
  pauseButton,
  playButton,
  playerStatus,
  readDiagnostics,
  readGainSamples,
  readPlayerSnapshot,
  setSliderValue,
  skipAudioFlowOnWindowsWebkit,
  startGainSampler,
  suspendAudioContext,
  totalTime,
} from './helpers';

test.describe('comparison workspace', () => {
  test('E2E-01 opens empty with the privacy statement and a disabled player', async ({ page }) => {
    await page.goto('/');
    await ensureComparisonEditor(page);

    await expect(page.locator('.privacy-line')).toContainText(
      'Local-only listening. Your audio stays in this browser. Switchroom does not upload or store your files.',
    );

    await expect(page.locator('.dropzone')).toHaveCount(2);
    await expect(page.locator('.file-head__name')).toHaveCount(0);

    await expect(playButton(page)).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Original', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Edited', exact: true })).toBeDisabled();
    await expect(page.getByRole('slider', { name: 'Playback position' })).toBeDisabled();
    await expect(playerStatus(page)).toHaveText('Add both recordings to enable the player.');

    const diagnostics = await readDiagnostics(page);
    expect(diagnostics.original.ready).toBe(false);
    expect(diagnostics.edited.ready).toBe(false);
    expect(diagnostics.original.currentTime).toBe(0);
    expect(diagnostics.edited.currentTime).toBe(0);
  });

  test('E2E-02 loads two valid WAV files and enables the player', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);

    await expect(page.locator('.slot--original .file-head__name')).toHaveText('original.wav');
    await expect(page.locator('.slot--edited .file-head__name')).toHaveText('edited.wav');
    await expect(page.locator('.slot--original .slot__status')).toHaveText('Ready');
    await expect(page.locator('.slot--edited .slot__status')).toHaveText('Ready');
    await expect(page.locator('.slot--original .file-meta')).toContainText('WAV');
    await expect(page.locator('.slot--edited .file-meta')).toContainText('WAV');

    await expect(playButton(page)).toBeEnabled();
    await expect(totalTime(page)).toHaveText('0:04');
    await expect(playerStatus(page)).toHaveText('Both files are ready. Press Play to begin.');
    await expect(page.locator('.player__notice')).toHaveCount(0);

    const diagnostics = await readDiagnostics(page);
    expect(diagnostics.original.ready).toBe(true);
    expect(diagnostics.edited.ready).toBe(true);
    expect(diagnostics.original.paused).toBe(true);
    expect(diagnostics.edited.paused).toBe(true);
  });

  test('E2E-03 plays, crossfades and switches at a nonzero timestamp', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);

    await playButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeGreaterThan(0.4);

    const beforeSwitch = await readDiagnostics(page);
    expect(beforeSwitch.original.paused).toBe(false);
    expect(beforeSwitch.edited.paused).toBe(false);
    await expect(playerStatus(page)).toHaveText('Playing Original. Switch versions at any time.');

    // Sample both gain automation curves throughout the switch. A real
    // crossfade must spend time in the middle rather than jumping.
    await startGainSampler(page);
    await page.getByRole('button', { name: 'Edited', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edited', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(playerStatus(page)).toHaveText('Playing Edited. Switch versions at any time.');
    await page.waitForTimeout(700);

    const fadeSamples = await readGainSamples(page);
    const midFade = fadeSamples.filter(
      (sample) =>
        sample.original.gain > 0.05 &&
        sample.original.gain < 0.95 &&
        sample.edited.gain > 0.05 &&
        sample.edited.gain < 0.95,
    );
    expect(fadeSamples.length).toBeGreaterThan(10);
    expect(midFade.length).toBeGreaterThan(0);

    const afterSwitch = await readDiagnostics(page);
    expect(afterSwitch.edited.currentTime).toBeGreaterThan(beforeSwitch.original.currentTime);
    expect(afterSwitch.edited.currentTime).toBeGreaterThan(0.4);
    expect(
      Math.abs(afterSwitch.edited.currentTime - afterSwitch.original.currentTime),
    ).toBeLessThan(0.12);
    expect(afterSwitch.edited.gain).toBeGreaterThan(0.95);
    expect(afterSwitch.original.gain).toBeLessThan(0.05);

    // Switch back and confirm the same continuity in the other direction.
    await startGainSampler(page);
    await page.getByRole('button', { name: 'Original', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Original', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.waitForTimeout(700);

    const backSamples = await readGainSamples(page);
    expect(
      backSamples.some(
        (sample) =>
          sample.original.gain > 0.05 &&
          sample.original.gain < 0.95 &&
          sample.edited.gain > 0.05 &&
          sample.edited.gain < 0.95,
      ),
    ).toBe(true);

    const afterSwitchBack = await readDiagnostics(page);
    expect(afterSwitchBack.original.currentTime).toBeGreaterThan(afterSwitch.edited.currentTime);
    expect(
      Math.abs(afterSwitchBack.original.currentTime - afterSwitchBack.edited.currentTime),
    ).toBeLessThan(0.12);
    expect(afterSwitchBack.original.gain).toBeGreaterThan(0.95);
    expect(afterSwitchBack.edited.gain).toBeLessThan(0.05);
  });

  test('E2E-04 pauses, seeks both decks and resumes', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);

    await playButton(page).click();
    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeGreaterThan(0.4);

    await pauseButton(page).click();
    await expect(playerStatus(page)).toHaveText('Paused on Original.');

    const atPause = await readDiagnostics(page);
    await page.waitForTimeout(400);
    const afterWait = await readDiagnostics(page);
    expect(Math.abs(afterWait.original.currentTime - atPause.original.currentTime)).toBeLessThan(
      0.05,
    );
    expect(Math.abs(afterWait.edited.currentTime - atPause.edited.currentTime)).toBeLessThan(0.05);

    await setSliderValue(page, 'Playback position', 1);
    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeCloseTo(1, 1);
    await expect
      .poll(async () => (await readDiagnostics(page)).edited.currentTime, { timeout: 5_000 })
      .toBeCloseTo(1, 1);
    await expect(page.getByLabel('Elapsed time')).toHaveText('0:01');

    await playButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeGreaterThan(1.2);
    await expect(playerStatus(page)).toHaveText('Playing Original. Switch versions at any time.');
  });

  test('E2E-05 rejects an empty file, an unsupported file and a corrupt load', async ({ page }) => {
    await page.goto('/');
    await ensureComparisonEditor(page);

    await originalInput(page).setInputFiles(fixturePath('empty.wav'));
    await expect(page.locator('.slot--original .slot__error')).toHaveText(
      'This file is empty. Choose an audio file with sound in it.',
    );

    await editedInput(page).setInputFiles(fixturePath('notes.txt'));
    await expect(page.locator('.slot--edited .slot__error')).toHaveText(
      'Choose a WAV, MP3, FLAC, AAC or M4A file.',
    );
    await expect(playButton(page)).toBeDisabled();

    await originalInput(page).setInputFiles(fixturePath('invalid.mp3'));
    await expect(page.locator('.slot--original .slot__error')).toContainText(
      'could not be opened by your browser',
    );
    await expect(page.locator('.slot--original .slot__status')).toHaveText('Needs attention');
    await expect(playerStatus(page)).toHaveText(
      'The Original file needs attention. Replace it to continue.',
    );
    await expect(playButton(page)).toBeDisabled();

    // The interface is still responsive after the failed load.
    await page.getByRole('button', { name: 'Dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.locator('.slot--original').getByRole('button', { name: 'Remove' }).click();
    await expect(page.locator('.slot--original .dropzone')).toBeVisible();
    await expect(playerStatus(page)).toHaveText('Add both recordings to enable the player.');
  });

  test('E2E-06 shows the shorter common duration and a mismatch note', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page, 'mismatch-original.wav', 'mismatch-edited.wav');

    await expect(page.locator('.slot--original .file-meta')).toContainText('0:03');
    await expect(page.locator('.slot--edited .file-meta')).toContainText('0:02');
    await expect(totalTime(page)).toHaveText('0:02');
    await expect(page.locator('.player__notice')).toContainText(
      'The versions have different lengths.',
    );
    await expect(page.locator('.player__notice')).toContainText('0:02');

    const diagnostics = await readDiagnostics(page);
    expect(diagnostics.original.ready).toBe(true);
    expect(diagnostics.edited.ready).toBe(true);
  });

  test('E2E-07 replaces a file and removes one while playing', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);
    await expect(totalTime(page)).toHaveText('0:04');

    await originalInput(page).setInputFiles(fixturePath('short-original.wav'));
    await expect(page.locator('.slot--original .file-head__name')).toHaveText('short-original.wav');
    await expect(totalTime(page)).toHaveText('0:01');
    await expect(page.locator('.player__notice')).toContainText(
      'The versions have different lengths.',
    );
    await expect(playButton(page)).toBeEnabled();

    await playButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeGreaterThan(0.2);

    await page.locator('.slot--edited').getByRole('button', { name: 'Remove' }).click();
    await expect(page.locator('.slot--edited .dropzone')).toBeVisible();
    await expect(playerStatus(page)).toHaveText('Add the Edited recording to enable the player.');
    await expect(page.locator('.player__notice')).toHaveCount(0);
    await expect(playButton(page)).toBeDisabled();

    const diagnostics = await readDiagnostics(page);
    expect(diagnostics.edited.ready).toBe(false);
    expect(diagnostics.original.paused).toBe(true);
    expect(diagnostics.edited.paused).toBe(true);
    expect(diagnostics.original.currentTime).toBe(0);
  });

  test('E2E-10 stops at the common end and replays from the start', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page, 'short-original.wav', 'short-edited.wav');
    await expect(totalTime(page)).toHaveText('0:01');

    await playButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await expect(pauseButton(page)).toHaveCount(0, { timeout: 5_000 });
    await expect(playerStatus(page)).toHaveText('Paused on Original.');
    await expect(page.getByLabel('Elapsed time')).toHaveText('0:01');

    const atEnd = await readDiagnostics(page);
    expect(atEnd.original.paused).toBe(true);
    expect(atEnd.edited.paused).toBe(true);
    expect(atEnd.original.currentTime).toBeGreaterThan(0.9);
    expect(atEnd.original.currentTime).toBeLessThan(1.2);

    await playButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeLessThan(0.6);
  });

  test('E2E-11 keeps file handling local with no uploads or third-party requests', async ({
    page,
  }) => {
    skipAudioFlowOnWindowsWebkit();
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));

    await page.goto('/');
    const origin = new URL(page.url()).origin;
    await loadPair(page);

    const externalRequests = requests.filter(
      (url) => !url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:'),
    );
    expect(externalRequests).toEqual([]);
    expect(requests.some((url) => requestNamesFile(url))).toBe(false);

    // Nothing is written to browser storage until a manual theme choice.
    expect(await page.evaluate(() => Object.keys(window.localStorage))).toEqual([]);
  });

  test('E2E-12 repeated Play clicks during startup produce one start', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);

    await page.locator('.play-button').evaluate((button) => {
      const element = button as HTMLButtonElement;
      element.click();
      element.click();
      element.click();
    });

    await expect(pauseButton(page)).toBeVisible();
    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeGreaterThan(0.2);

    const diagnostics = await readDiagnostics(page);
    expect(diagnostics.original.playAttempts).toBe(1);
    expect(diagnostics.edited.playAttempts).toBe(1);
    expect(diagnostics.original.paused).toBe(false);
    expect(diagnostics.edited.paused).toBe(false);
  });

  test('E2E-16 rapid A/B reversal keeps the latest request and valid gains', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);
    await playButton(page).click();
    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeGreaterThan(0.4);

    await page.evaluate(async () => {
      const engine = window.__switchroom?.engine;

      if (!engine) {
        throw new Error('The Switchroom development test hook is not available.');
      }

      const first = engine.switchTo('edited');
      const second = engine.switchTo('original');
      const third = engine.switchTo('edited');
      await Promise.all([first, second, third]);
    });

    const editedTab = page.getByRole('button', { name: 'Edited', exact: true });
    await expect(editedTab).toHaveAttribute('aria-pressed', 'true');
    await expect(playerStatus(page)).toHaveText('Playing Edited. Switch versions at any time.');

    const diagnostics = await readDiagnostics(page);
    expect(diagnostics.original.gain).toBeGreaterThanOrEqual(0);
    expect(diagnostics.original.gain).toBeLessThanOrEqual(1);
    expect(diagnostics.edited.gain).toBeGreaterThanOrEqual(0);
    expect(diagnostics.edited.gain).toBeLessThanOrEqual(1);
    expect(diagnostics.edited.gain).toBeGreaterThan(0.95);
    expect(diagnostics.original.gain).toBeLessThan(0.05);
    expect(
      Math.abs(diagnostics.edited.currentTime - diagnostics.original.currentTime),
    ).toBeLessThan(0.12);

    await expect
      .poll(async () => (await readDiagnostics(page)).edited.currentTime, { timeout: 5_000 })
      .toBeGreaterThan(diagnostics.edited.currentTime);
  });

  test('E2E-17 seeks while playing and keeps both decks converged', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);
    await playButton(page).click();
    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeGreaterThan(0.4);

    await setSliderValue(page, 'Playback position', 1);

    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeCloseTo(1, 1);
    await expect
      .poll(async () => (await readDiagnostics(page)).edited.currentTime, { timeout: 5_000 })
      .toBeCloseTo(1, 1);
    await expect(page.getByLabel('Elapsed time')).toHaveText('0:01');
    await expect(pauseButton(page)).toBeVisible();
    await expect(playerStatus(page)).toHaveText('Playing Original. Switch versions at any time.');

    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeGreaterThan(1.05);

    await page.getByRole('button', { name: 'Edited', exact: true }).click();
    await expect(playerStatus(page)).toHaveText('Playing Edited. Switch versions at any time.');

    // Both decks are playing, so a single sample can catch one media clock
    // mid-update. Poll briefly for convergence instead of asserting on one
    // frame (this was a Firefox-only flake in the release gate).
    await expect
      .poll(
        async () => {
          const diagnostics = await readDiagnostics(page);
          return Math.abs(diagnostics.edited.currentTime - diagnostics.original.currentTime);
        },
        { timeout: 3_000 },
      )
      .toBeLessThan(0.12);

    const afterSwitch = await readDiagnostics(page);
    expect(afterSwitch.edited.currentTime).toBeGreaterThan(1);
  });

  test('E2E-18 pausing during a fade settles on the target deck', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);
    await playButton(page).click();
    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeGreaterThan(0.4);

    await page.evaluate(async () => {
      const engine = window.__switchroom?.engine;

      if (!engine) {
        throw new Error('The Switchroom development test hook is not available.');
      }

      const switching = engine.switchTo('edited');
      const started = performance.now();

      while (performance.now() - started < 1_000) {
        const snapshot = engine.getSnapshot();

        if (snapshot.switchingTo === 'edited' && snapshot.audibleVersion === 'edited') {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      engine.pause();
      await switching;
    });

    await expect(playerStatus(page)).toHaveText('Paused on Edited.');

    const diagnostics = await readDiagnostics(page);
    expect(diagnostics.original.paused).toBe(true);
    expect(diagnostics.edited.paused).toBe(true);
    expect(diagnostics.original.gain).toBeLessThan(0.05);
    expect(diagnostics.edited.gain).toBeGreaterThan(0.95);
    expect(
      Math.abs(diagnostics.edited.currentTime - diagnostics.original.currentTime),
    ).toBeLessThan(0.12);

    const snapshot = await readPlayerSnapshot(page);
    expect(snapshot.status).toBe('paused');
    expect(snapshot.switchingTo).toBeNull();
    expect(snapshot.audibleVersion).toBe('edited');
  });

  test('E2E-19 suspends the audio context and recovers with an explicit Play', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);
    await playButton(page).click();
    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeGreaterThan(0.4);

    await suspendAudioContext(page);

    await expect(playerStatus(page)).toHaveText(
      'Your browser interrupted audio playback. Press Play to continue.',
    );
    await expect(playButton(page)).toBeVisible();

    const interrupted = await readPlayerSnapshot(page);
    expect(interrupted.status).toBe('interrupted');
    expect(interrupted.isPlaying).toBe(false);
    expect(interrupted.interrupted).toBe(true);
    expect(interrupted.currentTime).toBeGreaterThan(0);

    await playButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await expect(playerStatus(page)).toHaveText('Playing Original. Switch versions at any time.');
    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeGreaterThan(interrupted.currentTime);
  });

  test('E2E-22 accepts a supported extension with a generic MIME type', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await ensureComparisonEditor(page);

    const wav = readFileSync(fixturePath('original.wav'));

    await originalInput(page).setInputFiles({
      name: 'generic-original.wav',
      mimeType: 'application/octet-stream',
      buffer: wav,
    });
    await editedInput(page).setInputFiles(fixturePath('edited.wav'));

    await expect(page.locator('.slot--original .slot__status')).toHaveText('Ready');
    await expect(page.locator('.slot--original .file-head__name')).toHaveText(
      'generic-original.wav',
    );
    await expect(playButton(page)).toBeEnabled();
    await expect(page.locator('.slot--original .slot__error')).toHaveCount(0);
  });

  test('E2E-23 repeated replace and remove cycles leave no stale UI', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);

    const wav = readFileSync(fixturePath('original.wav'));

    for (let index = 0; index < 3; index += 1) {
      await originalInput(page).setInputFiles({
        name: `cycle-${index}.wav`,
        mimeType: 'audio/wav',
        buffer: wav,
      });
      await expect(page.locator('.slot--original .file-head__name')).toHaveText(
        `cycle-${index}.wav`,
      );
      await expect(page.locator('.slot--original .slot__status')).toHaveText('Ready');
      await expect(playButton(page)).toBeEnabled();

      await page.locator('.slot--original').getByRole('button', { name: 'Remove' }).click();
      await expect(page.locator('.slot--original .dropzone')).toBeVisible();
      await expect(page.locator('.slot--original .slot__status')).toHaveText('Waiting');
      await expect(playButton(page)).toBeDisabled();
    }

    await originalInput(page).setInputFiles(fixturePath('original.wav'));
    await expect(page.locator('.slot--original .file-head__name')).toHaveText('original.wav');
    await expect(page.locator('.slot--original .slot__status')).toHaveText('Ready');
    await expect(playerStatus(page)).toHaveText('Both files are ready. Press Play to begin.');
  });

  test('E2E-25 slider fill terminates exactly at the thumb centre', async ({ page }) => {
    await page.goto('/');
    await ensureComparisonEditor(page);

    const measure = (wrapperSelector: string) =>
      page.evaluate((selector) => {
        const wrapper = document.querySelector(selector);
        if (!wrapper) {
          return null;
        }
        const rail = wrapper.querySelector('.range-control__rail')?.getBoundingClientRect();
        const fill = wrapper.querySelector('.range-control__fill')?.getBoundingClientRect();
        const thumb = wrapper.querySelector('.range-control__thumb')?.getBoundingClientRect();

        if (!rail || !fill || !thumb) {
          return null;
        }

        return {
          railLeft: rail.left,
          railWidth: rail.width,
          fillWidth: fill.width,
          thumbCenter: thumb.left + thumb.width / 2,
        };
      }, wrapperSelector);

    for (const [value, fraction] of [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
    ] as const) {
      await setSliderValue(page, 'Master volume', value);
      const geometry = await measure('.volume__range');

      expect(geometry).not.toBeNull();
      if (!geometry) return;

      // Half a CSS pixel of tolerance: fill width and thumb centre are both
      // percentages of the same inset rail box.
      expect(geometry.fillWidth).toBeCloseTo(geometry.railWidth * fraction, 0);
      expect(geometry.thumbCenter - geometry.railLeft).toBeCloseTo(
        geometry.railWidth * fraction,
        0,
      );
    }

    // The same component drives the timeline; check it at 50 % of 4 s too.
    skipAudioFlowOnWindowsWebkit();
    await loadPair(page);
    await setSliderValue(page, 'Playback position', 2);
    const timeline = await measure('.timeline__range');

    expect(timeline).not.toBeNull();
    if (!timeline) return;

    expect(timeline.fillWidth).toBeCloseTo(timeline.railWidth * 0.5, 0);
    expect(timeline.thumbCenter - timeline.railLeft).toBeCloseTo(timeline.railWidth * 0.5, 0);
  });

  test('E2E-24 changes the transition duration without restarting playback', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);
    await playButton(page).click();
    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeGreaterThan(0.3);

    const slider = page.getByRole('slider', { name: 'Crossfade' });
    await expect(slider).toHaveValue('180');
    await expect(slider).toHaveAttribute('aria-valuetext', '180 milliseconds');
    await expect(page.locator('.transition__value')).toHaveText('180 ms');

    const before = await readDiagnostics(page);

    await setSliderValue(page, 'Crossfade', 600);
    await expect(slider).toHaveValue('600');
    await expect(slider).toHaveAttribute('aria-valuetext', '600 milliseconds');
    await expect(page.locator('.transition__value')).toHaveText('600 ms');

    await setSliderValue(page, 'Crossfade', 40);
    await expect(slider).toHaveValue('80');
    await expect(page.locator('.transition__value')).toHaveText('80 ms');

    await setSliderValue(page, 'Crossfade', 900);
    await expect(slider).toHaveValue('600');
    await expect(page.locator('.transition__value')).toHaveText('600 ms');

    await expect(pauseButton(page)).toBeVisible();
    await expect(playerStatus(page)).toHaveText('Playing Original. Switch versions at any time.');
    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeGreaterThan(before.original.currentTime);
    expect(await page.evaluate(() => Object.keys(window.localStorage))).toEqual([]);
  });
});

function requestNamesFile(url: string): boolean {
  return url.includes('original.wav') || url.includes('edited.wav') || url.includes('short-');
}
