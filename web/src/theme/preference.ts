import { THEMES, type ThemeId, type ThemePreference } from './contract';

/** The theme choice is stored with the other UI preferences. */
export const APPEARANCE_STORAGE_KEY = 'clio.appearance.v1';
/** Where the earlier next-themes selector kept the choice; read once and migrated. */
const LEGACY_THEME_KEY = 'theme';
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'dark';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export interface ResolvedTheme {
  id: ThemeId;
  dark: boolean;
}

function availableTheme(value: unknown): ThemePreference | undefined {
  if (value === 'system') return 'system';
  const theme = THEMES.find((candidate) => candidate.id === value);
  if (!theme || (theme.development && !import.meta.env.DEV)) return undefined;
  return theme.id;
}

/** Any stored value, including a missing or malformed one, becomes a theme this build offers. */
export function parseThemePreference(value: unknown): ThemePreference {
  return availableTheme(value) ?? DEFAULT_THEME_PREFERENCE;
}

/** The stored choice, migrating the legacy key when the appearance record has none. */
export function readThemePreference(storage: Pick<Storage, 'getItem'>): ThemePreference {
  try {
    const record = JSON.parse(storage.getItem(APPEARANCE_STORAGE_KEY) ?? '{}') as {
      theme?: unknown;
    };
    if (record && typeof record === 'object' && 'theme' in record) {
      return parseThemePreference(record.theme);
    }
    return parseThemePreference(storage.getItem(LEGACY_THEME_KEY));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

/** Light and Dark are fixed; System and system-following themes take the OS scheme. */
export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'system') return { id: systemDark ? 'dark' : 'light', dark: systemDark };
  const theme = THEMES.find((candidate) => candidate.id === preference)!;
  return { id: theme.id, dark: theme.scheme === 'system' ? systemDark : theme.scheme === 'dark' };
}

/** Put the resolved theme on <html>, where `themes.css` and the `dark:` variant read it. */
export function applyTheme(root: HTMLElement, theme: ResolvedTheme): void {
  if (root.dataset.theme !== theme.id) root.dataset.theme = theme.id;
  root.classList.toggle('dark', theme.dark);
}

/** Switch themes in one frame: color transitions would otherwise stagger the change. */
export function switchTheme(root: HTMLElement, theme: ResolvedTheme): void {
  if (root.dataset.theme === theme.id && root.classList.contains('dark') === theme.dark) return;
  const pause = document.createElement('style');
  pause.textContent = '*, *::before, *::after { transition: none !important; }';
  document.head.append(pause);
  applyTheme(root, theme);
  void getComputedStyle(root).color;
  window.setTimeout(() => pause.remove(), 1);
}

/** Run before first paint by the boot script that `vite-plugin-theme.ts` injects. */
export function applyStoredTheme(): void {
  let preference = DEFAULT_THEME_PREFERENCE;
  try {
    preference = readThemePreference(window.localStorage);
  } catch {
    // Storage can be unavailable; the default theme still applies.
  }
  applyTheme(
    document.documentElement,
    resolveTheme(preference, window.matchMedia(DARK_SCHEME_QUERY).matches),
  );
}
