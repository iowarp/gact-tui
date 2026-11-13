import { t } from '@lingui/core/macro';
import { i18n } from '@/i18n/instance';

/** The interface language as a BCP 47 tag `Intl` accepts (the pseudo-locale reads as English). */
export function formatLocale(): string {
  return i18n.locale === 'pseudo' ? 'en' : i18n.locale;
}

/**
 * The gap between two sentences rendered side by side: a space, except in
 * Japanese and Chinese, where "。" ends a sentence without one.
 */
export function sentenceGap(): string {
  return /^(ja|zh)\b/u.test(formatLocale()) ? '' : ' ';
}

/**
 * Joins clauses into one line with the language's list comma ("A, B" in
 * English, "A、B" in Japanese). `Intl.ListFormat` unit lists join Japanese
 * with spaces, so the separator is a message.
 */
export function joinClauses(parts: readonly string[]): string {
  if (!parts.length) return '';
  return parts.reduce((joined, next) => t`${joined}, ${next}`);
}

/**
 * Cached Intl formatters for per-row hot paths. `Date#toLocale*String` and
 * `Number#toLocaleString` build a new formatter on every call, which costs a
 * long transcript tens of milliseconds per page. They format in the interface
 * language, which cannot change without a reload.
 */
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<number, Intl.NumberFormat>();

function dateFormat(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(formatLocale(), options);
    dateFormats.set(key, format);
  }
  return format;
}

/** Same as `new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })`. */
export function formatClockTime(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t`Invalid Date`;
  return dateFormat('clock', { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** Same as `new Date(value).toLocaleString()`. */
export function formatDateTime(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t`Invalid Date`;
  return dateFormat('date-time', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).format(date);
}

/** Same as `value.toLocaleString(undefined, { maximumFractionDigits })`. */
export function formatNumber(value: number, maximumFractionDigits = 3): string {
  let format = numberFormats.get(maximumFractionDigits);
  if (!format) {
    format = new Intl.NumberFormat(formatLocale(), { maximumFractionDigits });
    numberFormats.set(maximumFractionDigits, format);
  }
  return format.format(value);
}
