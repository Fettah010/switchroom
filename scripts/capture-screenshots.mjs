#!/usr/bin/env node
/* global document, window -- used inside Playwright page.evaluate callbacks */
/**
 * Captures the README screenshots from a running build (preview or deployed).
 *
 * Usage: start `npm run preview`, then run `node scripts/capture-screenshots.mjs`.
 * Override the target with SCREENSHOT_URL and the output folder with SCREENSHOT_DIR.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseURL = process.env.SCREENSHOT_URL ?? 'http://127.0.0.1:4173';
const outputDir = resolve(process.env.SCREENSHOT_DIR ?? 'docs/screenshots');

const shots = [
  { name: 'desktop-light.png', width: 1440, height: 900, theme: 'Light' },
  { name: 'desktop-dark.png', width: 1440, height: 900, theme: 'Dark' },
  { name: 'mobile-360.png', width: 360, height: 800, theme: 'System' },
];

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required'],
});

try {
  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: { width: shot.width, height: shot.height },
      colorScheme: 'light',
    });
    const page = await context.newPage();

    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page
      .getByLabel('Choose Original audio file')
      .setInputFiles('tests/e2e/fixtures/original.wav');
    await page
      .getByLabel('Choose Edited audio file')
      .setInputFiles('tests/e2e/fixtures/edited.wav');
    await page.getByRole('button', { name: 'Play', exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => !document.querySelector('.play-button')?.hasAttribute('disabled'),
      undefined,
      { timeout: 10_000 },
    );

    await page.getByRole('button', { name: `${shot.theme} theme` }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(outputDir, shot.name), fullPage: true });

    console.log(`Captured ${shot.name} at ${shot.width}x${shot.height}`);
    await context.close();
  }
} finally {
  await browser.close();
}
