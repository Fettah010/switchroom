import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  editedInput,
  fixturePath,
  loadPair,
  originalInput,
  pauseButton,
  playButton,
  readDiagnostics,
  setSliderValue,
  skipAudioFlowOnWindowsWebkit,
  totalTime,
} from './helpers';

let bigWavPath = '';

test.describe('waveform and shared timeline', () => {
  test.beforeAll(async () => {
    const dir = join(tmpdir(), 'switchroom-e2e');
    await mkdir(dir, { recursive: true });
    // 100 MB file: above the default 60 MB source-size ceiling → too-large fallback.
    bigWavPath = join(dir, 'big.wav');
    await writeFile(bigWavPath, new Uint8Array(100 * 1024 * 1024));
  });

  test('renders both waveform rows with A/B labels after files load', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);

    const labels = page.locator('.waveform__label');
    await expect(labels).toHaveCount(2);
    await expect(labels.first()).toHaveText('A');
    await expect(labels.last()).toHaveText('B');
    await expect(page.locator('canvas')).toHaveCount(2);
  });

  test('clicking either waveform row seeks both decks to the same time', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);

    // Click the centre of the shared waveform container while paused; both
    // decks must seek to the same canonical time. The pointer handler lives on
    // the shared `.waveform` container, so both rows respond to the same click.
    const container = page.locator('.waveform').first();
    await container.click();

    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeCloseTo(2, 1); // 50% of the 4 s common duration
    await expect
      .poll(async () => (await readDiagnostics(page)).edited.currentTime, { timeout: 5_000 })
      .toBeCloseTo(2, 1);
    await expect(page.getByLabel('Elapsed time')).toHaveText('0:02');
  });

  test('timeline slider and waveform playhead stay in sync', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);

    await setSliderValue(page, 'Playback position', 1);
    await expect(page.getByLabel('Elapsed time')).toHaveText('0:01');

    await playButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await expect(totalTime(page)).toHaveText('0:04');

    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeGreaterThan(1.05);
  });

  test('waveform fallback keeps audio usable when analysis is skipped', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');

    // A file far above the source-size ceiling triggers the too-large fallback.
    await originalInput(page).setInputFiles(bigWavPath);
    await editedInput(page).setInputFiles(fixturePath('edited.wav'));

    await expect(page.locator('.slot--edited .slot__status')).toHaveText('Ready');
    // Original stays non-ready (oversized), so Play remains disabled.
    await expect(playButton(page)).toBeDisabled();
  });

  test('reduced motion keeps all content visible', async ({ page }) => {
    await page.goto('/');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();

    // Nothing stays hidden awaiting an animation.
    await expect(
      page.getByRole('heading', { level: 1, name: /Hear the difference/i }),
    ).toBeVisible();
    await expect(page.locator('.slot__title')).toHaveText(['Original', 'Edited']);
    await expect(page.getByRole('button', { name: /Choose or drop a file/i })).toHaveCount(2);
    await expect(page.getByText(/Local-only listening/i)).toBeVisible();
  });
});
