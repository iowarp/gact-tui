/**
 * Cached Intl formatters for per-row hot paths. `Date#toLocale*String` and
 * `Number#toLocaleString` build a new formatter on every call, which costs a
 * long transcript tens of milliseconds per page. Output is identical; the
 * runtime's default locale cannot change without a reload.
 */
const dateFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<number, Intl.NumberFormat>();

function dateFormat(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(undefined, options);
    dateFormats.set(key, format);
  }
  return format;
}

/** Same as `new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })`. */
export function formatClockTime(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid Date';
  return dateFormat('clock', { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** Same as `new Date(value).toLocaleString()`. */
export function formatDateTime(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid Date';
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
    format = new Intl.NumberFormat(undefined, { maximumFractionDigits });
    numberFormats.set(maximumFractionDigits, format);
  }
  return format.format(value);
}
