import { expect, test } from '@playwright/test';
import { loadPair, playButton, readDiagnostics, skipAudioFlowOnWindowsWebkit } from './helpers';

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

    const originalBox = await page.locator('.slot--original').boundingBox();
    const editedBox = await page.locator('.slot--edited').boundingBox();
    expect(originalBox).not.toBeNull();
    expect(editedBox).not.toBeNull();
    expect(editedBox!.x).toBeGreaterThan(originalBox!.x + originalBox!.width - 1);
    expect(Math.abs(editedBox!.y - originalBox!.y)).toBeLessThan(2);

    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
  });
});
