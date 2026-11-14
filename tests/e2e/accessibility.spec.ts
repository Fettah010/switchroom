import { expect, test } from '@playwright/test';
import {
  loadPair,
  pauseButton,
  playButton,
  readDiagnostics,
  skipAudioFlowOnWindowsWebkit,
} from './helpers';

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('E2E-09 keeps the core interface usable without nonessential motion', async ({ page }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');

    expect(
      await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    ).toBe(true);

    // Motion skips its entrance animation, so the hero is fully readable at once.
    await expect(page.locator('.hero__copy')).toBeVisible();
    expect(
      await page
        .locator('.hero__copy')
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity)),
    ).toBe(1);

    await loadPair(page);
    await playButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await expect
      .poll(async () => (await readDiagnostics(page)).original.currentTime, { timeout: 5_000 })
      .toBeGreaterThan(0.2);
    await page.getByRole('button', { name: 'Edited', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edited', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

test.describe('keyboard access', () => {
  test('E2E-09 shows a skip link, a logical tab order and visible focus', async ({ page }) => {
    await page.goto('/');
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toBeVisible();
    await page.keyboard.press('Tab');
    const skipLinkReceivedTab = await skipLink.evaluate(
      (element) => document.activeElement === element,
    );
    test.skip(
      !skipLinkReceivedTab,
      'This WebKit build omits links from the default tab order; Safari needs Full Keyboard Access enabled.',
    );
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);

    // A fragment navigation keeps Chrome's sequential focus start point, so
    // load an unfragmented document for the tab-order check.
    await page.goto('/?tab-order=1');
    await expect(skipLink).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('.wordmark')).toBeFocused();

    const topbarSettings = page.locator('.topbar-settings-btn');
    await page.keyboard.press('Tab');
    await expect(topbarSettings).toBeFocused();

    const systemTheme = page.getByRole('button', { name: 'System theme' });
    await page.keyboard.press('Tab');
    await expect(systemTheme).toBeFocused();
    expect(
      await systemTheme.evaluate((element) => getComputedStyle(element).outlineStyle),
    ).not.toBe('none');

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Dark theme' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Light theme' })).toBeFocused();

    const newComparisonBtn = page.getByRole('button', { name: 'New comparison' });
    await page.keyboard.press('Tab');
    await expect(newComparisonBtn).toBeFocused();

    // Activate New Comparison via keyboard Enter
    await page.keyboard.press('Enter');
    await expect(page.locator('.slot--original')).toBeVisible();

    // Tab through workspace toolbar controls into the dropzone
    while (
      !(await page
        .locator('.slot--original .dropzone')
        .evaluate((el) => document.activeElement === el))
    ) {
      await page.keyboard.press('Tab');
    }
    await expect(page.locator('.slot--original .dropzone')).toBeFocused();
  });

  test('E2E-09 operates playback, switching, volume and mute from the keyboard', async ({
    page,
  }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);

    await playButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(pauseButton(page)).toBeVisible();

    const editedTab = page.getByRole('button', { name: 'Edited', exact: true });
    await editedTab.focus();
    await page.keyboard.press('Space');
    await expect(editedTab).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => (await readDiagnostics(page)).edited.currentTime, { timeout: 5_000 })
      .toBeGreaterThan(0);

    const volumeSlider = page.getByRole('slider', { name: 'Master volume' });
    await volumeSlider.focus();
    await expect(volumeSlider).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.volume__value')).toHaveText('99%');

    const crossfadeSlider = page.getByRole('slider', { name: 'Crossfade' });
    await crossfadeSlider.focus();
    await expect(crossfadeSlider).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.transition__value')).toHaveText('200 ms');
    await expect(crossfadeSlider).toHaveAttribute('aria-valuetext', '200 milliseconds');

    await page.getByRole('button', { name: 'Mute' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Unmute' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.volume__value')).toHaveText('Muted');
  });
});
