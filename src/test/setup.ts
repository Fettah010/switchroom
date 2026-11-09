import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
export interface MatchMediaController {
  matches: boolean;
  listeners: Set<(event: MediaQueryListEvent) => void>;
}

export function installMatchMedia(initialMatches = false): MatchMediaController {
  const controller: MatchMediaController = {
    matches: initialMatches,
    listeners: new Set(),
  };

  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') ? controller.matches : false,
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        controller.listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        controller.listeners.delete(listener);
      },
      addListener: (listener: (event: MediaQueryListEvent) => void) => {
        controller.listeners.add(listener);
      },
      removeListener: (listener: (event: MediaQueryListEvent) => void) => {
        controller.listeners.delete(listener);
      },
      dispatchEvent: () => true,
    })),
  );

  return controller;
}

// jsdom does not implement ResizeObserver. Provide a minimal no-op stub so
// components that measure their container can mount in unit tests.
class ResizeObserverStub {
  observe(): void {
    // no-op
  }
  unobserve(): void {
    // no-op
  }
  disconnect(): void {
    // no-op
  }
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub);

beforeEach(() => {
  installMatchMedia(false);
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
