/**
 * State model for the appearance settings panel (theme, density, font) backed
 * by persisted preferences.
 */
import { SPLASH_INTRO_KEY } from './splashModel.js';
import {
  DEFAULT_DARK_PRESET_ID,
  DEFAULT_LIGHT_PRESET_ID,
  THEME_MODE_KEY,
  THEME_PRESET_KEY,
  THEME_PRESETS,
  THEME_TOKENS_KEY,
  type ThemeMode,
  type ThemePresetMode,
} from '../theme.js';

export interface AppearanceThemeState {
  presetId: string;
  mode: ThemeMode;
  tokens: Record<string, string>;
}

export function loadIntroSplash(storage: Storage | undefined = safeLocalStorage()): string {
  if (!storage) return '';
  try {
    return storage.getItem(SPLASH_INTRO_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveIntroSplash(
  value: string,
  storage: Storage | undefined = safeLocalStorage(),
): void {
  if (!storage) return;
  try {
    if (value) storage.setItem(SPLASH_INTRO_KEY, value);
    else storage.removeItem(SPLASH_INTRO_KEY);
  } catch {
    /* quota - ignore */
  }
}

export function updateThemeToken(
  current: Record<string, string>,
  key: string,
  value: string,
): Record<string, string> {
  const next = { ...current };
  if (value) next[key] = value;
  else delete next[key];
  return next;
}

export function persistThemeTokens(
  tokens: Record<string, string>,
  storage: Storage | undefined = safeLocalStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(THEME_TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    /* ignore */
  }
}

export function removeThemeTokens(storage: Storage | undefined = safeLocalStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(THEME_TOKENS_KEY);
  } catch {
    /* ignore */
  }
}

export function appearanceStateForPreset(id: string): AppearanceThemeState | null {
  const preset = THEME_PRESETS[id];
  if (!preset) return null;
  return {
    presetId: id,
    tokens: preset.tokens,
    mode: preset.mode,
  };
}

export function appearanceStateForMode(
  mode: ThemeMode,
  prefersLight = prefersLightScheme(),
): AppearanceThemeState {
  const presetMode = presetModeForThemeMode(mode, prefersLight);
  const presetId = presetMode === 'light' ? DEFAULT_LIGHT_PRESET_ID : DEFAULT_DARK_PRESET_ID;
  return {
    presetId,
    mode,
    tokens: THEME_PRESETS[presetId]?.tokens ?? {},
  };
}

export function presetModeForThemeMode(
  mode: ThemeMode,
  prefersLight = prefersLightScheme(),
): ThemePresetMode {
  if (mode === 'auto') return prefersLight ? 'light' : 'dark';
  return mode;
}

export function presetEntriesForThemeMode(
  mode: ThemeMode,
  prefersLight = prefersLightScheme(),
): Array<[string, (typeof THEME_PRESETS)[string]]> {
  const presetMode = presetModeForThemeMode(mode, prefersLight);
  return Object.entries(THEME_PRESETS).filter(
    ([id, preset]) => preset.mode === presetMode && id !== 'default',
  );
}

export function persistThemeMode(
  mode: ThemeMode,
  storage: Storage | undefined = safeLocalStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(THEME_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function loadActivePreset(storage: Storage | undefined = safeLocalStorage()): string {
  if (!storage) return DEFAULT_DARK_PRESET_ID;
  try {
    return storage.getItem(THEME_PRESET_KEY) ?? DEFAULT_DARK_PRESET_ID;
  } catch {
    return DEFAULT_DARK_PRESET_ID;
  }
}

export function clearClioPreferences(storage: Storage, prefix = 'clio.'): number {
  let removed = 0;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && key.startsWith(prefix)) {
      storage.removeItem(key);
      removed += 1;
    }
  }
  return removed;
}

function safeLocalStorage(): Storage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage;
}

function prefersLightScheme(): boolean {
  return (
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: light)').matches
  );
}
