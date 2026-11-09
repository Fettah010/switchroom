import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  editedInput,
  loadPair,
  originalInput,
  pauseButton,
  playButton,
  readDiagnostics,
  setSliderValue,
  skipAudioFlowOnWindowsWebkit,
  totalTime,
} from './helpers';

let longWavPath = '';

/**
 * A real, playable PCM WAV long enough to exceed the 30-minute analysis
 * duration ceiling. 8 kHz mono 8-bit keeps it under 15 MB while still decoding
 * in the browser, so both decks become ready with waveform analysis skipped.
 */
function makeLongWav(durationSeconds: number): Uint8Array {
  const sampleRate = 8000;
  const channelCount = 1;
  const bitsPerSample = 8;
  const blockAlign = channelCount * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataLength = durationSeconds * byteRate;

  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeAscii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataLength, true);

  const file = new Uint8Array(44 + dataLength);
  file.set(new Uint8Array(header), 0);
  return file;
}

test.describe('waveform and shared timeline', () => {
  test.beforeAll(async () => {
    const dir = join(tmpdir(), 'switchroom-e2e');
    await mkdir(dir, { recursive: true });
    // 31 minutes of silence: valid and playable, but past the analysis limit.
    longWavPath = join(dir, 'long.wav');
    await writeFile(longWavPath, makeLongWav(31 * 60));
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

    // The plot column is the seek surface. Its centre is 50% of the common
    // duration; the A/B label gutter is deliberately excluded.
    const plot = page.locator('.waveform__plot').first();
    await plot.click();

    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeCloseTo(2, 1); // 50% of the 4 s common duration
    await expect
      .poll(async () => (await readDiagnostics(page)).edited.currentTime, { timeout: 5_000 })
      .toBeCloseTo(2, 1);
    await expect(page.getByLabel('Elapsed time')).toHaveText('0:02');
  });

  test('seeks at 25 % and 70 % of the plot against the common duration', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);

    const plot = page.locator('.waveform__plot').first();
    await expect(plot).toBeVisible();

    // Click by fraction of the plot box. Playwright resolves a fresh bounding
    // box for each click, so the entrance animation cannot invalidate it.
    const clickAt = async (fraction: number): Promise<void> => {
      const box = await plot.boundingBox();
      expect(box).not.toBeNull();
      if (!box) return;
      await plot.click({ position: { x: box.width * fraction, y: box.height / 2 } });
    };

    await clickAt(0.25);
    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeCloseTo(1, 1);

    await clickAt(0.7);
    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeCloseTo(2.8, 1);
    await expect
      .poll(async () => (await readDiagnostics(page)).edited.currentTime, { timeout: 5_000 })
      .toBeCloseTo(2.8, 1);
  });

  test('clips mismatched lengths to the shared common duration', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    // 3.0 s original vs 2.4 s edited: the shared window ends at 2.4 s.
    await loadPair(page, 'mismatch-original.wav', 'mismatch-edited.wav');

    await expect(totalTime(page)).toHaveText('0:02');

    const plot = page.locator('.waveform__plot').first();
    const box = await plot.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // Clicking the far right of the plot must land on the common end, never
    // on the longer recording's own end.
    await plot.click({ position: { x: box.width - 1, y: box.height / 2 } });

    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeCloseTo(2.4, 1);
    await expect
      .poll(async () => (await readDiagnostics(page)).edited.currentTime, { timeout: 5_000 })
      .toBeCloseTo(2.4, 1);
    await expect(page.getByLabel('Elapsed time')).toHaveText('0:02');
  });

  test('draws real non-empty pixels in both waveform canvases', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);

    await expect(page.locator('.waveform__canvas[data-ready="true"]')).toHaveCount(2);

    // The fixtures are constant-amplitude sine tones, so a real symmetric
    // envelope fills a large share of each canvas. Counting any non-zero alpha
    // would pass on the faint centreline alone, which is exactly the failure
    // this guards against: ink coverage and column height must be substantial.
    const measureInk = (): Promise<Array<{ coverage: number; tallest: number }>> =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll('.waveform__canvas')).map((canvas) => {
          const element = canvas as HTMLCanvasElement;
          const context = element.getContext('2d');
          if (!context || element.width === 0 || element.height === 0) {
            return { coverage: 0, tallest: 0 };
          }

          const pixels = context.getImageData(0, 0, element.width, element.height).data;
          let opaque = 0;

          for (let index = 3; index < pixels.length; index += 4) {
            if (pixels[index]! > 0) {
              opaque += 1;
            }
          }

          let tallest = 0;

          for (let x = 0; x < element.width; x += 1) {
            let column = 0;
            for (let y = 0; y < element.height; y += 1) {
              if (pixels[(y * element.width + x) * 4 + 3]! > 0) {
                column += 1;
              }
            }
            tallest = Math.max(tallest, column);
          }

          return { coverage: opaque / (element.width * element.height), tallest };
        }),
      );

    await expect
      .poll(
        async () => {
          const lanes = await measureInk();
          return (
            lanes.length === 2 && lanes.every((lane) => lane.coverage > 0.2 && lane.tallest > 12)
          );
        },
        { timeout: 10_000 },
      )
      .toBe(true);

    const lanes = await measureInk();
    expect(lanes).toHaveLength(2);

    for (const lane of lanes) {
      expect(lane.coverage).toBeGreaterThan(0.2);
      expect(lane.tallest).toBeGreaterThan(12);
    }
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

  test('waveform fallback keeps audio usable and shows a centreline, not a blank fill', async ({
    page,
  }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');

    // Both files are valid and playable, but 31 minutes exceeds the analysis
    // duration ceiling, so the waveforms fall back while playback stays usable.
    await originalInput(page).setInputFiles(longWavPath);
    await editedInput(page).setInputFiles(longWavPath);

    await expect(page.locator('.slot--original .slot__status')).toHaveText('Ready');
    await expect(page.locator('.slot--edited .slot__status')).toHaveText('Ready');
    await expect(page.locator('.waveform__status')).toContainText(/Waveform preview skipped/i);
    await expect(playButton(page)).toBeEnabled();

    // No peaks means no misleading progress tint, but each lane still shows a
    // visible centreline so the plot reads as intentionally flat.
    await expect(page.locator('.waveform__canvas[data-placeholder="true"]')).toHaveCount(2);
    await expect(page.locator('.waveform__progress')).toHaveCount(0);
    await expect(page.locator('.waveform__playhead')).toHaveCount(1);
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
