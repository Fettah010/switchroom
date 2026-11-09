#!/usr/bin/env node
/* global document, window -- used inside Playwright page.evaluate callbacks */
/**
 * Post-build smoke check against a production-like preview or the deployed site.
 *
 *   npm run build
 *   npm run preview
 *   npm run smoke
 *
 * Override the target with SMOKE_URL=https://your-site.workers.dev.
 * Exits non-zero when any observable behaviour is wrong.
 */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// Vite preview prints and binds `localhost`, which may resolve to IPv6 only on
// some Windows hosts; use the same host name so the default check just works.
const baseURL = process.env.SMOKE_URL ?? 'http://localhost:4173';
const screenshotPath = resolve(process.env.SMOKE_SCREENSHOT ?? 'test-results/preview-smoke.png');

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(baseURL, { waitUntil: 'networkidle' });

  assert.match(await page.title(), /Switchroom/);
  assert.equal(
    await page.locator('.privacy-line').getByText('Local-only listening.').isVisible(),
    true,
  );
  assert.equal(
    await page.evaluate(() => window.__switchroom === undefined),
    true,
    'The development engine hook must not exist in a production build.',
  );
  assert.equal(await page.getByRole('button', { name: 'Play', exact: true }).isDisabled(), true);

  await page
    .getByLabel('Choose Original audio file')
    .setInputFiles(resolve('tests/e2e/fixtures/original.wav'));
  await page
    .getByLabel('Choose Edited audio file')
    .setInputFiles(resolve('tests/e2e/fixtures/edited.wav'));
  await page.waitForFunction(
    () => !document.querySelector('.play-button')?.hasAttribute('disabled'),
    undefined,
    { timeout: 10_000 },
  );

  assert.equal(await page.locator('.slot__status--ready').count(), 2);
  assert.equal(await page.locator('.timeline__times .time--total').textContent(), '0:04');

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(1_000);
  assert.equal(await page.getByRole('button', { name: 'Pause', exact: true }).isVisible(), true);
  assert.notEqual(await page.locator('.timeline__times .time').first().textContent(), '0:00');
  assert.equal(
    await page.locator('#player-status').textContent(),
    'Playing Original. Switch versions at any time.',
  );

  await page.getByRole('button', { name: 'Edited', exact: true }).click();
  await page.waitForTimeout(500);
  assert.equal(
    await page.getByRole('button', { name: 'Edited', exact: true }).getAttribute('aria-pressed'),
    'true',
  );
  assert.notEqual(await page.locator('.timeline__times .time').first().textContent(), '0:00');

  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  assert.equal(await page.locator('#player-status').textContent(), 'Paused on Edited.');

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);

  await mkdir(dirname(screenshotPath), { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(`Smoke test passed against ${baseURL}`);
  console.log(`Screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
}
