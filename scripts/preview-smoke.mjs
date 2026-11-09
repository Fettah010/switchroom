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
  assert.equal(await page.locator('.site-footer__version').textContent(), 'v0.3.0');

  // Both real waveform lanes must finish analysis and paint in the production
  // worker bundle, not just in the dev server.
  await page.waitForFunction(
    () => document.querySelectorAll('.waveform__canvas[data-ready="true"]').length === 2,
    undefined,
    { timeout: 10_000 },
  );
  assert.equal(await page.locator('.waveform__canvas').count(), 2);
  assert.equal(await page.locator('.waveform__status').count(), 0);

  // Real peaks, not just the faint centreline: the generated fixtures are
  // constant-amplitude tones, so each lane should be substantially inked.
  const laneCoverage = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.waveform__canvas')).map((canvas) => {
      const context = canvas.getContext('2d');
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let opaque = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) {
          opaque += 1;
        }
      }
      return opaque / (canvas.width * canvas.height);
    }),
  );
  assert.equal(laneCoverage.length, 2);
  for (const coverage of laneCoverage) {
    assert.ok(coverage > 0.2, `Waveform lane coverage was only ${coverage}`);
  }

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
