import { describe, expect, it } from 'vitest';
import { THEME_MODE_KEY, THEME_TOKENS_KEY } from '../../src/theme.js';
import {
  appearanceStateForMode,
  appearanceStateForPreset,
  clearClioPreferences,
  loadActivePreset,
  loadIntroSplash,
  persistThemeMode,
  persistThemeTokens,
  removeThemeTokens,
  saveIntroSplash,
  updateThemeToken,
} from '../../src/routes/SettingsAppearanceModel.js';
import { SPLASH_INTRO_KEY } from '../../src/routes/splashModel.js';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  };
}

describe('SettingsAppearanceModel', () => {
  it('loads, saves, and clears the intro splash text', () => {
    const storage = memoryStorage();
    expect(loadIntroSplash(storage)).toBe('');
    saveIntroSplash('Booting CLIO', storage);
    expect(storage.getItem(SPLASH_INTRO_KEY)).toBe('Booting CLIO');
    expect(loadIntroSplash(storage)).toBe('Booting CLIO');
    saveIntroSplash('', storage);
    expect(storage.getItem(SPLASH_INTRO_KEY)).toBeNull();
  });

  it('updates and persists theme token overrides', () => {
    const storage = memoryStorage();
    const next = updateThemeToken({ '--color-accent': '#123456' }, '--color-bg', '#ffffff');
    expect(next).toEqual({ '--color-accent': '#123456', '--color-bg': '#ffffff' });
    expect(updateThemeToken(next, '--color-bg', '')).toEqual({ '--color-accent': '#123456' });

    persistThemeTokens(next, storage);
    expect(storage.getItem(THEME_TOKENS_KEY)).toBe(JSON.stringify(next));
    removeThemeTokens(storage);
    expect(storage.getItem(THEME_TOKENS_KEY)).toBeNull();
  });

  it('derives preset and mode state for the appearance section', () => {
    expect(appearanceStateForPreset('missing')).toBeNull();
    expect(appearanceStateForPreset('light')).toMatchObject({
      presetId: 'light',
      mode: 'light',
    });
    expect(appearanceStateForMode('dark')).toEqual({
      presetId: 'default',
      mode: 'dark',
      tokens: {},
    });
    expect(appearanceStateForMode('light').presetId).toBe('light');
  });

  it('loads active preset, persists mode, and clears only clio preferences', () => {
    const storage = memoryStorage({
      'clio.theme.preset.v1': 'dim',
      'clio.foo': '1',
      'other.foo': '2',
    });
    expect(loadActivePreset(storage)).toBe('dim');
    persistThemeMode('auto', storage);
    expect(storage.getItem(THEME_MODE_KEY)).toBe('auto');

    expect(clearClioPreferences(storage)).toBe(3);
    expect(storage.getItem('clio.foo')).toBeNull();
    expect(storage.getItem(THEME_MODE_KEY)).toBeNull();
    expect(storage.getItem('other.foo')).toBe('2');
  });
});
