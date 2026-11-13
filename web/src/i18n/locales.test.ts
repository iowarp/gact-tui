import { describe, expect, it } from 'vitest';
import {
  availableLanguages,
  LOCALE_STORAGE_KEY,
  matchLocale,
  readLocalePreference,
  resolveLocale,
  systemLocale,
  writeLocalePreference,
} from './locales';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    values,
  };
}

describe('interface languages', () => {
  it('matches a regional tag to its base language', () => {
    expect(matchLocale('es-MX')).toBe('es');
    expect(matchLocale('ja_JP')).toBe('ja');
    expect(matchLocale('EL')).toBe('el');
    expect(matchLocale('fr-FR')).toBeUndefined();
    expect(matchLocale('')).toBeUndefined();
  });

  it('never reaches the pseudo-locale through a system language', () => {
    expect(matchLocale('pseudo-XA')).toBeUndefined();
    expect(systemLocale(['pseudo'])).toBe('pseudo');
    expect(systemLocale(['fr-FR', 'es-ES', 'en'])).toBe('es');
    expect(systemLocale(['fr-FR'])).toBe('en');
  });

  it('offers the pseudo-locale only in development', () => {
    expect(availableLanguages(false).map(({ locale }) => locale)).toEqual(['en', 'es', 'ja', 'el']);
    expect(availableLanguages(true).map(({ locale }) => locale)).toContain('pseudo');
  });

  it('prefers the URL, then the stored choice, then the system', () => {
    const systemLanguages = ['ja-JP'];
    expect(resolveLocale({ query: 'el', preference: 'es', systemLanguages })).toBe('el');
    expect(resolveLocale({ query: 'xx', preference: 'es', systemLanguages })).toBe('es');
    expect(resolveLocale({ preference: 'system', systemLanguages })).toBe('ja');
    // A development-only choice stored by a development build is not kept by a release.
    expect(resolveLocale({ preference: 'pseudo', systemLanguages, development: false })).toBe('ja');
    expect(
      resolveLocale({ query: 'pseudo', preference: 'system', systemLanguages, development: false }),
    ).toBe('pseudo');
  });

  it('stores a choice and forgets it for System', () => {
    const storage = memoryStorage();
    writeLocalePreference(storage, 'es');
    expect(storage.values.get(LOCALE_STORAGE_KEY)).toBe('es');
    expect(readLocalePreference(storage)).toBe('es');
    writeLocalePreference(storage, 'system');
    expect(storage.values.has(LOCALE_STORAGE_KEY)).toBe(false);
    expect(readLocalePreference(memoryStorage({ [LOCALE_STORAGE_KEY]: 'klingon' }))).toBe('system');
  });
});
