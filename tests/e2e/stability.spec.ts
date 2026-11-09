import { expect, test, type Locator } from '@playwright/test';
import { loadPair, skipAudioFlowOnWindowsWebkit } from './helpers';

type Box = { x: number; y: number; width: number; height: number } | null;

test.describe('Play/Pause geometry stability', () => {
  test('button and surrounding controls do not move across transport states', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);

    // Let the entrance reveal settle so the baseline geometry is stable
    // (Motion entrance animates translate-y, which shifts bounding boxes).
    await expect(page.locator('.slot--original')).toHaveCSS('opacity', '1');
    await expect(page.locator('.slot--edited')).toHaveCSS('opacity', '1');
    await page.waitForTimeout(300);

    const locators: Record<string, Locator> = {
      play: page.locator('.play-button'),
      transport: page.locator('.transport'),
      version: page.locator('.version-switch'),
      timeline: page.locator('.timeline'),
      volume: page.getByRole('slider', { name: 'Master volume' }),
      crossfade: page.getByRole('slider', { name: 'Crossfade' }),
      player: page.locator('.player'),
    };

    const capture = async (): Promise<Record<string, Box>> => {
      const out: Record<string, Box> = {};
      for (const [name, locator] of Object.entries(locators)) {
        out[name] = await locator.boundingBox();
      }
      return out;
    };

    const within = (a: Box, b: Box): boolean => {
      if (!a || !b) {
        return false;
      }
      const tol = 1;
      return (
        Math.abs(a.x - b.x) <= tol &&
        Math.abs(a.y - b.y) <= tol &&
        Math.abs(a.width - b.width) <= tol &&
        Math.abs(a.height - b.height) <= tol
      );
    };

    // Play → playing.
    await page.evaluate(() => {
      void (
        window as unknown as { __switchroom?: { engine: { play: () => Promise<void> } } }
      ).__switchroom?.engine?.play();
    });
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await page.waitForTimeout(100);
    const playing = await capture();

    // Pause → paused.
    await page.evaluate(() => {
      (
        window as unknown as { __switchroom?: { engine: { pause: () => void } } }
      ).__switchroom?.engine?.pause();
    });
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await page.waitForTimeout(100);
    const paused = await capture();

    // Switch to Edited while paused (immediate, no fade).
    await page.evaluate(() => {
      void (
        window as unknown as {
          __switchroom?: { engine: { switchTo: (v: string) => Promise<void> } };
        }
      ).__switchroom?.engine?.switchTo('edited');
    });
    await expect(page.getByRole('button', { name: 'Edited', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.waitForTimeout(100);
    const switched = await capture();

    for (const [name, playingBox] of Object.entries(playing)) {
      if (!within(playingBox, paused[name]!)) {
        throw new Error(
          `${name} moved between playing and paused: playing=${JSON.stringify(
            playingBox,
          )} paused=${JSON.stringify(paused[name]!)}`,
        );
      }
      if (!within(playingBox, switched[name]!)) {
        throw new Error(
          `${name} moved between playing and switched: playing=${JSON.stringify(
            playingBox,
          )} switched=${JSON.stringify(switched[name]!)}`,
        );
      }
    }
  });
});
