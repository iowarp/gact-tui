import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INTERFACE_LANGUAGES } from '@/i18n/locales';
import { chosenLanguage, nativeCopy } from './native-copy';

function desktopSource(path: string): string {
  return readFileSync(new URL(`../../../desktop/src-tauri/${path}`, import.meta.url), 'utf8');
}

/** `(key, English)` pairs from `ENGLISH` in the desktop host's native_copy.rs. */
function rustEnglish(): Map<string, string> {
  const source = desktopSource('src/native_copy.rs');
  const table = source.slice(source.indexOf('pub(crate) const ENGLISH'), source.indexOf('];'));
  const pairs = new Map<string, string>();
  for (const match of table.matchAll(/\(\s*"([^"]+)",\s*"((?:[^"\\]|\\.)*)",?\s*\)/gsu)) {
    const text = match[2]
      // A `\` at a line end continues the literal, dropping the newline and indentation.
      .replace(/\\\n\s*/gu, '')
      .replace(/\\n/gu, '\n')
      .replace(/\\"/gu, '"');
    pairs.set(match[1], text);
  }
  return pairs;
}

describe('desktop native copy', () => {
  it('sends exactly the keys the desktop host knows, with the same English text', () => {
    const rust = rustEnglish();
    expect(rust.size).toBeGreaterThan(40);
    expect(Object.fromEntries(Object.entries(nativeCopy()).sort())).toEqual(
      Object.fromEntries([...rust].sort()),
    );
  });

  it('sends a language only when the person picked one', () => {
    expect(chosenLanguage('es')).toBe('es');
    expect(chosenLanguage('en')).toBe('en');
    expect(chosenLanguage('system')).toBeNull();
    expect(chosenLanguage('pseudo')).toBeNull();
    expect(chosenLanguage('fr')).toBeNull();
  });

  it('declares the interface languages in the bundle and the host', () => {
    const languages = INTERFACE_LANGUAGES.filter((language) => !language.development).map(
      (language) => language.locale,
    );
    const plist = desktopSource('Info.plist');
    const declared = plist.slice(plist.indexOf('<key>CFBundleLocalizations</key>'));
    const plistLanguages = [
      ...declared.slice(0, declared.indexOf('</array>')).matchAll(/<string>([^<]+)<\/string>/gu),
    ].map((match) => match[1]);
    const host = /BUNDLE_LANGUAGES: \[&str; \d+\] = \[([^\]]*)\]/u.exec(
      desktopSource('src/app_language.rs'),
    );
    const hostLanguages = [...(host?.[1] ?? '').matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
    expect(plistLanguages).toEqual(languages);
    expect(hostLanguages).toEqual(languages);
  });
});
