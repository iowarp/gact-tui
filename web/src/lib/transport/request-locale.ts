import { i18n } from '@/i18n/instance';
import { PSEUDO_LOCALE, SOURCE_LOCALE } from '@/i18n/locales';

/** The request header that tells the agent, and the servers it calls, the interface language. */
export const LOCALE_HEADER = 'X-Clio-Locale';

/** The interface language as a BCP 47 tag; pseudo-localization asks servers for English. */
export function requestLocale(): string {
  const locale = i18n.locale || SOURCE_LOCALE;
  return locale === PSEUDO_LOCALE ? SOURCE_LOCALE : locale;
}
