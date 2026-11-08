import type { AudioContextLike, AudioElementLike, AudioHost } from './audioTypes';

/**
 * Browser adapter for the engine's dependency boundary.
 *
 * These casts are deliberate boundary shims: the engine interfaces describe
 * only the members it uses, while the real platform objects have a wider shape.
 */
export function createBrowserAudioHost(): AudioHost {
  const probe = document.createElement('audio');

  return {
    createAudioElement(): AudioElementLike {
      const element = document.createElement('audio');
      element.preload = 'metadata';
      return element;
    },

    createAudioContext(): AudioContextLike {
      const AudioContextConstructor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextConstructor) {
        throw new Error('Web Audio is not available in this browser.');
      }

      return new AudioContextConstructor() as unknown as AudioContextLike;
    },

    createObjectURL(file: File): string {
      return URL.createObjectURL(file);
    },

    revokeObjectURL(url: string): void {
      URL.revokeObjectURL(url);
    },

    probeCanPlayType(mimeType: string): string {
      return probe.canPlayType(mimeType);
    },

    requestFrame(callback: () => void): number {
      return window.requestAnimationFrame(() => callback());
    },

    cancelFrame(handle: number): void {
      window.cancelAnimationFrame(handle);
    },
  };
}
