/** Theme resolution and the single localStorage preference v0.1 is allowed to keep. */

export type ThemeMode = 'system' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'switchroom.theme';

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'dark' || value === 'light';
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === 'dark') {
    return 'dark';
  }

  if (mode === 'light') {
    return 'light';
  }

  return systemPrefersDark ? 'dark' : 'light';
}

type ReadableStorage = Pick<Storage, 'getItem'>;

export function readStoredTheme(storage?: ReadableStorage | null): ThemeMode {
  try {
    const target = storage ?? window.localStorage;
    const stored = target.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

type WritableStorage = Pick<Storage, 'setItem'>;

export function writeStoredTheme(mode: ThemeMode, storage?: WritableStorage | null): void {
  try {
    const target = storage ?? window.localStorage;
    target.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Private browsing and blocked storage must not break the interface.
  }
}

export function systemPrefersDark(): boolean {
  try {
    return typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false;
  } catch {
    return false;
  }
}

export function applyTheme(theme: ResolvedTheme, root: Document = document): void {
  root.documentElement.dataset.theme = theme;

  try {
    root.documentElement.style.colorScheme = theme;
  } catch {
    // Older engines can reject colorScheme assignment; the data attribute still works.
  }

  const meta = root.querySelector('meta[name="theme-color"]');

  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#08090b' : '#f4f1e9');
  }
}
