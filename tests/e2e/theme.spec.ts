import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  editedInput,
  ensureComparisonEditor,
  fixturePath,
  loadPair,
  originalInput,
  playButton,
  readDiagnostics,
  skipAudioFlowOnWindowsWebkit,
} from './helpers';

test.use({ colorScheme: 'light' });

test.describe('theme and responsive layout', () => {
  test('E2E-08 applies System, Dark and Light and persists the manual choice', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('button', { name: 'System theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByRole('button', { name: 'Dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Dark theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // The manual choice survives a full reload.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Dark theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByRole('button', { name: 'Light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('button', { name: 'Light theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // System follows the operating-system preference in both directions.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.getByRole('button', { name: 'System theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    const stored = await page.evaluate(() => Object.keys(window.localStorage));
    expect(stored).toEqual(['switchroom.theme']);
    expect(await page.evaluate(() => window.localStorage.getItem('switchroom.theme'))).toBe(
      'system',
    );
  });

  test('E2E-09 stays usable at 360 px without horizontal overflow', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    await ensureComparisonEditor(page);

    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
    expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);

    const originalBox = await page.locator('.slot--original').boundingBox();
    const editedBox = await page.locator('.slot--edited').boundingBox();
    expect(originalBox).not.toBeNull();
    expect(editedBox).not.toBeNull();
    expect(editedBox!.y).toBeGreaterThan(originalBox!.y + originalBox!.height - 1);

    await loadPair(page);
    await expect(playButton(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edited', exact: true })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Playback position' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Master volume' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Crossfade' })).toBeVisible();
    await expect(page.locator('.transition__value')).toHaveText('180 ms');
    await expect(page.getByRole('button', { name: 'System theme' })).toBeVisible();

    await playButton(page).click();
    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeGreaterThan(0.2);
    await page.getByRole('button', { name: 'Edited', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edited', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const afterInteraction = await page.evaluate(() => {
      window.scrollTo(0, 0);
      return {
        document: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      };
    });
    expect(afterInteraction.document).toBeLessThanOrEqual(afterInteraction.viewport + 1);
  });

  test('E2E-09 uses two columns at 1440 px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await ensureComparisonEditor(page);

    // Let the entrance reveal complete so layout measurements are stable.
    await page.waitForFunction(() => {
      const original = document.querySelector('.slot--original');
      const edited = document.querySelector('.slot--edited');
      return (
        Boolean(original && edited) &&
        window.getComputedStyle(original!).opacity === '1' &&
        window.getComputedStyle(edited!).opacity === '1'
      );
    });

    // Both slots share one grid row, so their top edges must align. Poll
    // until the reveal stagger has settled in every engine.
    await page.waitForFunction(() => {
      const a = document.querySelector('.slot--original');
      const b = document.querySelector('.slot--edited');
      if (!a || !b) {
        return false;
      }
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return Math.abs(ra.top - rb.top) <= 1;
    });

    // Read both rects in one synchronous evaluation so an entrance animation
    // running between two protocol round-trips cannot shift one box relative
    // to the other.
    const layout = await page.evaluate(() => {
      const original = document.querySelector('.slot--original')!.getBoundingClientRect();
      const edited = document.querySelector('.slot--edited')!.getBoundingClientRect();

      return {
        original: { x: original.x, y: original.y, width: original.width },
        edited: { x: edited.x, y: edited.y },
        overflow: {
          document: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
        },
      };
    });

    expect(layout.edited.x).toBeGreaterThan(layout.original.x + layout.original.width - 1);
    expect(Math.abs(layout.edited.y - layout.original.y)).toBeLessThan(2);
    expect(layout.overflow.document).toBeLessThanOrEqual(layout.overflow.viewport + 1);
  });

  test('E2E-26 long filenames and errors stay contained at 360 px', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    await ensureComparisonEditor(page);

    const longName = `${'very-long-original-recording-name-'.repeat(4)}.wav`;
    const wav = readFileSync(fixturePath('original.wav'));

    await originalInput(page).setInputFiles({
      name: longName,
      mimeType: 'audio/wav',
      buffer: wav,
    });
    await editedInput(page).setInputFiles(fixturePath('edited.wav'));

    await expect(playButton(page)).toBeEnabled();
    await expect(page.locator('.slot--original .file-head__name')).toHaveText(longName);

    const loadedOverflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(loadedOverflow.document).toBeLessThanOrEqual(loadedOverflow.viewport + 1);

    await expect(
      page.locator('.slot--original').getByRole('button', { name: 'Replace' }),
    ).toBeVisible();
    await expect(
      page.locator('.slot--original').getByRole('button', { name: 'Remove' }),
    ).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Crossfade' })).toBeVisible();

    await originalInput(page).setInputFiles({
      name: `${'broken-export-'.repeat(10)}.mp3`,
      mimeType: 'audio/mpeg',
      buffer: Buffer.from('this is not playable audio'),
    });

    await expect(page.locator('.slot--original .slot__error')).toBeVisible();
    await expect(page.locator('.slot--original .slot__status')).toHaveText('Needs attention');

    const errorOverflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(errorOverflow.document).toBeLessThanOrEqual(errorOverflow.viewport + 1);

    await expect(
      page.locator('.slot--original').getByRole('button', { name: 'Remove' }),
    ).toBeVisible();
  });
});
