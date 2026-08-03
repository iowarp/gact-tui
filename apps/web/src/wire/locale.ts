/**
 * Locale persistence shared across the web app. The TUI ships en/es/ja/el
 * dictionaries and persists the user's choice under
 * `~/.config/gact/config.json:ui.locale`; we mirror that on the web side
 * via localStorage so the Client can attach `Accept-Language` on every
 * request. UI string translation is not yet wired — the header is sent
 * so future backend-driven copy (errors, hints, slash command titles)
 * can honor the preference without another round-trip.
 */

export type LocaleTag = 'en' | 'es' | 'ja' | 'el';

export interface LocaleChoice {
  tag: LocaleTag;
  label: string;
  nativeLabel: string;
}

export const LOCALE_KEY = 'clio.locale.v1';

export const LOCALES: LocaleChoice[] = [
  { tag: 'en', label: 'English', nativeLabel: 'English' },
  { tag: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { tag: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { tag: 'el', label: 'Greek', nativeLabel: 'Ελληνικά' },
];

export const DEFAULT_LOCALE: LocaleTag = 'en';

function isLocaleTag(v: unknown): v is LocaleTag {
  return v === 'en' || v === 'es' || v === 'ja' || v === 'el';
}

/**
 * Reads the persisted locale from `localStorage`. Falls back to the
 * default when localStorage is unavailable or the stored value is
 * not one of the supported tags. Returns the value, never `null`.
 */
export function loadLocale(): LocaleTag {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_LOCALE;
    const raw = localStorage.getItem(LOCALE_KEY);
    if (raw && isLocaleTag(raw)) return raw;
  } catch {
    /* ignore — sandboxed contexts */
  }
  return DEFAULT_LOCALE;
}

/**
 * Persists the user's choice. Throws nothing — callers don't need to
 * handle the localStorage-disabled case explicitly.
 */
export function saveLocale(tag: LocaleTag): void {
  try {
    localStorage.setItem(LOCALE_KEY, tag);
  } catch {
    /* ignore */
  }
}

/**
 * Returns the current locale tag for inclusion in `Accept-Language`.
 * Returns `null` when the user has the default `en` selected, so the
 * client does not add an `Accept-Language` header at all — matching the
 * TUI's "no header on default" behavior.
 */
export function getRequestLocale(): string | null {
  const tag = loadLocale();
  return tag === DEFAULT_LOCALE ? null : tag;
}
