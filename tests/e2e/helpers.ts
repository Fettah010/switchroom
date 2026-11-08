import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export interface DeckDiagnostics {
  currentTime: number;
  paused: boolean;
  gain: number;
  ready: boolean;
}

export interface DeckDiagnosticsMap {
  original: DeckDiagnostics;
  edited: DeckDiagnostics;
}

export interface FadeSample extends DeckDiagnosticsMap {
  /** Milliseconds since the sampler started. */
  at: number;
}

type SamplerWindow = Window & {
  __switchroomGainSamples?: FadeSample[];
};

/** Absolute path to a generated fixture. */
export function fixturePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

/**
 * Playwright WebKit on Windows reports WAV support but never decodes local
 * media in this environment. The audio flows are still covered by Chromium
 * and Firefox; this guard keeps the WebKit UI checks meaningful.
 */
export function skipAudioFlowOnWindowsWebkit(): void {
  test.skip(
    process.platform === 'win32' && test.info().project.name === 'webkit',
    'Playwright WebKit on Windows does not decode local audio; audio flows run in Chromium and Firefox.',
  );
}

export function originalInput(page: Page) {
  return page.getByLabel('Choose Original audio file');
}

export function editedInput(page: Page) {
  return page.getByLabel('Choose Edited audio file');
}

export function playButton(page: Page) {
  return page.getByRole('button', { name: 'Play', exact: true });
}

export function pauseButton(page: Page) {
  return page.getByRole('button', { name: 'Pause', exact: true });
}

export function playerStatus(page: Page) {
  return page.locator('#player-status');
}

export function totalTime(page: Page) {
  return page.locator('.timeline__times .time--total');
}

/** Loads a pair of WAV fixtures and waits until both decks report ready. */
export async function loadPair(
  page: Page,
  original = 'original.wav',
  edited = 'edited.wav',
): Promise<void> {
  await originalInput(page).setInputFiles(fixturePath(original));
  await editedInput(page).setInputFiles(fixturePath(edited));
  await expect(playButton(page)).toBeEnabled();
  await expect(page.locator('.slot--original .slot__status')).toHaveText('Ready');
  await expect(page.locator('.slot--edited .slot__status')).toHaveText('Ready');
}

export async function readDiagnostics(page: Page): Promise<DeckDiagnosticsMap> {
  return page.evaluate(() => {
    const engine = window.__switchroom?.engine;

    if (!engine) {
      throw new Error('The Switchroom development test hook is not available.');
    }

    return engine.getDeckDiagnostics();
  });
}

/** Samples both deck gains every animation frame, for crossfade assertions. */
export async function startGainSampler(page: Page, durationMs = 600): Promise<void> {
  await page.evaluate((duration) => {
    const engine = window.__switchroom?.engine;

    if (!engine) {
      throw new Error('The Switchroom development test hook is not available.');
    }

    const samples: FadeSample[] = [];
    const started = performance.now();

    (window as SamplerWindow).__switchroomGainSamples = samples;

    const record = (): void => {
      const at = performance.now() - started;

      if (at > duration) {
        window.clearInterval(handle);
        return;
      }

      const diagnostics = engine.getDeckDiagnostics();
      samples.push({
        at,
        original: diagnostics.original,
        edited: diagnostics.edited,
      });
    };

    const handle = window.setInterval(record, 10);
    record();
  }, durationMs);
}

export async function readGainSamples(page: Page): Promise<FadeSample[]> {
  return page.evaluate(() => (window as SamplerWindow).__switchroomGainSamples ?? []);
}

/** Moves a range input the way a real pointer or keyboard interaction would. */
export async function setSliderValue(page: Page, label: string, value: number): Promise<void> {
  const slider = page.getByRole('slider', { name: label });
  await slider.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

    setter?.call(input, String(nextValue));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
