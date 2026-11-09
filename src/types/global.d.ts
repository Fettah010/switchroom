import type { ABAudioEngine } from '../audio/ABAudioEngine';
import type { AudioContextLike } from '../audio/audioTypes';

declare global {
  interface Window {
    /** Development-only test hook used by Playwright to inspect deck alignment. */
    __switchroom?: {
      engine: ABAudioEngine;
      getContext: () => AudioContextLike | null;
    };
  }
}

export {};
