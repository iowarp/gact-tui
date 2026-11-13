import type { Messages } from '@lingui/core';
import { i18n } from './instance';
import {
  interfaceLanguage,
  LOCALE_QUERY_PARAMETER,
  readLocalePreference,
  resolveLocale,
  SOURCE_LOCALE,
  type LocalePreference,
  writeLocalePreference,
} from './locales';

type CatalogModule = { messages: Messages };

// One lazily loaded chunk per language; English ships inside the components.
const catalogs = import.meta.glob<CatalogModule>('../locales/*/messages.po');

function catalogLoader(locale: string): (() => Promise<CatalogModule>) | undefined {
  return catalogs[`../locales/${locale}/messages.po`];
}

/** Put the language and its direction on <html> for screen readers, fonts and layout. */
export function applyDocumentLocale(root: HTMLElement, locale: string): void {
  root.lang = locale === 'pseudo' ? 'en-XA' : locale;
  root.dir = interfaceLanguage(locale).direction;
}

/** Load a language's catalog and make it the active one. */
export async function activateLocale(locale: string): Promise<void> {
  if (locale !== SOURCE_LOCALE) {
    const load = catalogLoader(locale);
    if (!load) throw new Error(`No message catalog for ${locale}`);
    const { messages } = await load();
    i18n.load(locale, messages);
  }
  i18n.activate(locale);
}

function readQueryLocale(): string | null {
  try {
    return new URLSearchParams(window.location.search).get(LOCALE_QUERY_PARAMETER);
  } catch {
    return null;
  }
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Activate the user's language before the application modules are imported.
 * Falls back to English, with a console warning, when a catalog cannot load,
 * so a broken or missing translation never blocks the app from opening.
 */
export async function bootstrapLocale(): Promise<string> {
  const storage = safeStorage();
  const locale = resolveLocale({
    query: readQueryLocale(),
    preference: storage ? readLocalePreference(storage) : 'system',
    systemLanguages: navigator.languages?.length ? navigator.languages : [navigator.language],
  });
  try {
    await activateLocale(locale);
  } catch (error) {
    console.warn(`Could not load the ${locale} interface language; using English.`, error);
    i18n.activate(SOURCE_LOCALE);
  }
  applyDocumentLocale(document.documentElement, i18n.locale);
  return i18n.locale;
}

/** The stored choice (`system` or a locale), for the Settings picker. */
export function currentLocalePreference(): LocalePreference {
  const storage = safeStorage();
  return storage ? readLocalePreference(storage) : 'system';
}

/**
 * Store a new language choice and reload so every string, including those
 * computed when a module loaded, is produced in that language. A `?locale=`
 * override is dropped so the stored choice takes effect.
 */
export function changeLocalePreference(preference: LocalePreference): void {
  const storage = safeStorage();
  if (storage) writeLocalePreference(storage, preference);
  const url = new URL(window.location.href);
  url.searchParams.delete(LOCALE_QUERY_PARAMETER);
  window.location.replace(url.toString());
}
