/**
 * The interface languages this build offers and how the preferred one is chosen.
 *
 * Kept free of Lingui imports so the bootstrap, the Settings picker and the
 * desktop host can all read it before any catalog is loaded.
 */

export const SOURCE_LOCALE = 'en';
export const PSEUDO_LOCALE = 'pseudo';

/** Stored with the other per-device UI preferences. `system` follows the OS/browser language. */
export const LOCALE_STORAGE_KEY = 'clio.locale.v1';
/** `?locale=es` opens a page in that language without changing the stored choice. */
export const LOCALE_QUERY_PARAMETER = 'locale';

export type LocalePreference = 'system' | string;

export interface InterfaceLanguage {
  /** BCP 47 tag; also the catalog directory under `src/locales/`. */
  locale: string;
  /** The name a speaker of the language reads it by (`Español`). Never translated. */
  nativeName: string;
  /** Text direction of the language. */
  direction: 'ltr' | 'rtl';
  /** The catalog was machine-translated and has not been reviewed by a speaker. */
  machineTranslated: boolean;
  /** Offered only in development builds and by `?locale=`. */
  development?: boolean;
}

export const INTERFACE_LANGUAGES: readonly InterfaceLanguage[] = [
  { locale: 'en', nativeName: 'English', direction: 'ltr', machineTranslated: false },
  { locale: 'es', nativeName: 'Español', direction: 'ltr', machineTranslated: true },
  { locale: 'ja', nativeName: '日本語', direction: 'ltr', machineTranslated: true },
  { locale: 'el', nativeName: 'Ελληνικά', direction: 'ltr', machineTranslated: true },
  {
    locale: PSEUDO_LOCALE,
    nativeName: 'Pseudo-locale',
    direction: 'ltr',
    machineTranslated: false,
    development: true,
  },
];

function offered(language: InterfaceLanguage, development: boolean): boolean {
  return !language.development || development;
}

/** Languages a user can pick in this build. */
export function availableLanguages(
  development: boolean = import.meta.env.DEV,
): readonly InterfaceLanguage[] {
  return INTERFACE_LANGUAGES.filter((language) => offered(language, development));
}

export function interfaceLanguage(locale: string): InterfaceLanguage {
  return INTERFACE_LANGUAGES.find((language) => language.locale === locale)!;
}

/**
 * The supported locale for a BCP 47 tag: an exact match, else the same base
 * language (`es-MX` → `es`). Undefined when the build has no such language.
 */
export function matchLocale(tag: string | null | undefined): string | undefined {
  if (!tag) return undefined;
  const wanted = tag.trim().toLowerCase().replace('_', '-');
  if (!wanted) return undefined;
  const exact = INTERFACE_LANGUAGES.find((language) => language.locale.toLowerCase() === wanted);
  if (exact) return exact.locale;
  const base = wanted.split('-')[0];
  return INTERFACE_LANGUAGES.find(
    (language) => !language.development && language.locale.toLowerCase() === base,
  )?.locale;
}

/** The first of the system's preferred languages this build offers, else English. */
export function systemLocale(languages: readonly string[]): string {
  for (const tag of languages) {
    const locale = matchLocale(tag);
    if (locale) return locale;
  }
  return SOURCE_LOCALE;
}

export function readLocalePreference(storage: Pick<Storage, 'getItem'>): LocalePreference {
  try {
    const stored = storage.getItem(LOCALE_STORAGE_KEY);
    if (!stored || stored === 'system') return 'system';
    return matchLocale(stored) ?? 'system';
  } catch {
    return 'system';
  }
}

export function writeLocalePreference(
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  preference: LocalePreference,
): void {
  if (preference === 'system') storage.removeItem(LOCALE_STORAGE_KEY);
  else storage.setItem(LOCALE_STORAGE_KEY, preference);
}

export interface LocaleInputs {
  /** `?locale=` on the page URL, if any. */
  query?: string | null;
  preference: LocalePreference;
  systemLanguages: readonly string[];
  development?: boolean;
}

/** URL override, then the stored choice, then the system languages. */
export function resolveLocale({
  query,
  preference,
  systemLanguages,
  development = import.meta.env.DEV,
}: LocaleInputs): string {
  const fromQuery = matchLocale(query);
  // A development-only locale may be opened by URL in any build: review screenshots use it.
  if (fromQuery) return fromQuery;
  if (preference !== 'system') {
    const stored = matchLocale(preference);
    if (stored && offered(interfaceLanguage(stored), development)) return stored;
  }
  return systemLocale(systemLanguages);
}
