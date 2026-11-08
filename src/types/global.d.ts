import type { ABAudioEngine } from '../audio/ABAudioEngine';

declare global {
  interface Window {
    /** Development-only test hook used by Playwright to inspect deck alignment. */
    __switchroom?: { engine: ABAudioEngine };
  }
}

export {};
