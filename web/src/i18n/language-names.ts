import { t } from '@lingui/core/macro';
import { i18n } from './instance';
import { interfaceLanguage } from './locales';

function displayNames(locale: string): Intl.DisplayNames | undefined {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' });
  } catch {
    return undefined;
  }
}

const readers = new Map<string, Intl.DisplayNames | undefined>();

function reader(locale: string): Intl.DisplayNames | undefined {
  if (!readers.has(locale)) readers.set(locale, displayNames(locale));
  return readers.get(locale);
}

/**
 * A language's name in the language the interface is shown in now (`Spanish`,
 * `Español`), when that differs from its own name.
 */
export function localLanguageName(locale: string): string | undefined {
  if (locale === 'pseudo') return t`Long accented test copy`;
  const name = reader(i18n.locale)?.of(locale);
  return name && name !== interfaceLanguage(locale).nativeName ? name : undefined;
}

/** A language's English name (`Spanish`), for search terms that work in any interface language. */
export function englishLanguageName(locale: string): string | undefined {
  return locale === 'pseudo' ? undefined : reader('en')?.of(locale);
}
