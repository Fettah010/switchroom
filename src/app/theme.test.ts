import { describe, expect, it } from 'vitest';
import {
  applyTheme,
  isThemeMode,
  readStoredTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeStoredTheme,
} from './theme';

describe('resolveTheme', () => {
  it('honours explicit choices', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('follows the system preference in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('isThemeMode', () => {
  it('accepts only the three supported modes', () => {
    expect(isThemeMode('system')).toBe(true);
    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('sepia')).toBe(false);
    expect(isThemeMode(null)).toBe(false);
  });
});

describe('theme storage', () => {
  it('reads a stored manual choice', () => {
    const storage = {
      getItem: (key: string) => (key === THEME_STORAGE_KEY ? 'light' : null),
    };
    expect(readStoredTheme(storage)).toBe('light');
  });

  it('falls back to system for missing or invalid values', () => {
    expect(readStoredTheme({ getItem: () => null })).toBe('system');
    expect(readStoredTheme({ getItem: () => 'sepia' })).toBe('system');
  });

  it('falls back safely when storage throws', () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readStoredTheme(throwingStorage)).toBe('system');
    expect(() =>
      writeStoredTheme('dark', {
        setItem: () => {
          throw new Error('blocked');
        },
      }),
    ).not.toThrow();
  });

  it('writes only the explicit mode key', () => {
    const writes: Array<[string, string]> = [];
    writeStoredTheme('dark', {
      setItem: (key, value) => {
        writes.push([key, value]);
      },
    });
    expect(writes).toEqual([[THEME_STORAGE_KEY, 'dark']]);
  });
});

describe('applyTheme', () => {
  it('sets the data attribute and colour scheme', () => {
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});
