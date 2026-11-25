/**
 * Shared display formatters.
 *
 * Sizes, durations, and truncated prose are rendered on many surfaces. Each one
 * has exactly one implementation here so the same byte count, the same elapsed
 * time, and the same overlong summary read identically wherever they appear.
 */

import { t } from '@lingui/core/macro';
import { formatLocale, formatNumber } from '@/lib/locale-format';

const BYTES_PER_KILOBYTE = 1_024;
const MILLISECONDS_PER_SECOND = 1_000;
const MILLISECONDS_PER_MINUTE = 60_000;

const BYTE_UNITS = ['KB', 'MB', 'GB', 'TB'] as const;

/**
 * Formats a byte count in binary units with the spec's `KB`/`MB`/`GB` labels,
 * as file managers do: 3,650,722,201 bytes is "3.4 GB", 512 KiB is "512 KB".
 * One decimal, dropped when it is `.0` from ten up ("200 MB", "5.0 GB").
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '';
  const magnitude = Math.abs(bytes);
  if (magnitude < BYTES_PER_KILOBYTE) return `${Math.round(bytes)} B`;
  let value = bytes / BYTES_PER_KILOBYTE;
  let index = 0;
  while (Math.abs(value) >= 999.95 && index < BYTE_UNITS.length - 1) {
    value /= BYTES_PER_KILOBYTE;
    index += 1;
  }
  const text = value.toFixed(1);
  return `${Math.abs(value) >= 10 && text.endsWith('.0') ? text.slice(0, -2) : text} ${BYTE_UNITS[index]}`;
}

/**
 * The same size in at most six characters for a fixed list column
 * (`2.0 KB`, `54 KB`, `540 KB`): one decimal only below ten. The full
 * `formatBytes` value belongs in the row's hover name.
 */
export function formatCompactBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < BYTES_PER_KILOBYTE) return `${Math.round(bytes)} B`;
  let value = bytes / BYTES_PER_KILOBYTE;
  let index = 0;
  while (value >= BYTES_PER_KILOBYTE && index < BYTE_UNITS.length - 1) {
    value /= BYTES_PER_KILOBYTE;
    index += 1;
  }
  if (value >= 999.5 && index < BYTE_UNITS.length - 1) {
    value /= BYTES_PER_KILOBYTE;
    index += 1;
  }
  return `${value < 9.95 ? value.toFixed(1) : Math.round(value)} ${BYTE_UNITS[index]}`;
}

/**
 * Formats the size of a stored resource, where a size that is not a real byte
 * count means the service could not report one — a distinct thing from zero
 * bytes, and worth saying rather than rendering as a number.
 */
export function formatResourceSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unavailable';
  return formatBytes(bytes);
}

/**
 * How a duration is written out.
 *
 * - `unit`: spelled-out units for reading surfaces: `840 ms`, `9 s`,
 *   `2 min 30 s`, `1 h 5 min`.
 * - `tenths`: same, but keeps one decimal below a minute where sub-second
 *   differences matter (tool timings).
 * - `wall`: a scheduler's wall time: whole seconds (never milliseconds) below
 *   a minute, then the same readings as `unit`.
 * - `short`: narrow units in running text or a fact value, whole seconds:
 *   `41s`, `2m 5s`, `1h 4m`.
 * - `elapsed`: the transcript's 44px elapsed column. Tenths below ten seconds
 *   (`0.4s`, `8.2s`), then `short` readings, keeping the larger unit only when a
 *   reading passes six characters (`23m`, `10h`).
 * - `trailing`: one rounded unit for a list row's trailing column: `40ms`,
 *   `2.4s`, `42s`, `9m`, `2h`.
 * - `compact`: one rounded unit, never below one second, for badges inside a
 *   graph node or another space-constrained glyph: `1s`, `9s`, `3m`, `2h`.
 *
 * Every unit comes from the interface language's catalog, so one reading never
 * mixes two languages' symbols ("30 λεπ. από 2 ώρ.", not "30 min από 2 ώρ.").
 */
export type DurationStyle =
  | 'unit'
  | 'tenths'
  | 'wall'
  | 'short'
  | 'elapsed'
  | 'trailing'
  | 'compact';

const SECONDS_PER_HOUR = 3_600;
const MILLISECONDS_PER_HOUR = 3_600_000;
/** The transcript's elapsed column holds six characters ("12m 4s"). */
const ELAPSED_COLUMN_CHARACTERS = 6;

let tenthsFormat: Intl.NumberFormat | undefined;

/** Always one decimal ("0.4", "8.0"); the elapsed column is a per-row hot path, so it is cached. */
function oneDecimal(value: number): string {
  tenthsFormat ??= new Intl.NumberFormat(formatLocale(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return tenthsFormat.format(value);
}

const narrow = {
  milliseconds: (milliseconds: number) =>
    t({ message: `${milliseconds}ms`, comment: 'Milliseconds in a narrow column, like "40ms"' }),
  seconds: (seconds: number | string) =>
    t({ message: `${seconds}s`, comment: 'Seconds in a narrow column, like "41s"' }),
  minutes: (minutes: number) =>
    t({ message: `${minutes}m`, comment: 'Minutes in a narrow column, like "23m"' }),
  minutesSeconds: (minutes: number, seconds: number) =>
    t({
      message: `${minutes}m ${seconds}s`,
      comment: 'Minutes and seconds in a narrow column; keep it as short as "12m 4s"',
    }),
  hours: (hours: number) =>
    t({ message: `${hours}h`, comment: 'Hours in a narrow column, like "10h"' }),
  hoursMinutes: (hours: number, minutes: number) =>
    t({
      message: `${hours}h ${minutes}m`,
      comment: 'Hours and minutes in a narrow column; keep it as short as "1h 4m"',
    }),
};

const spelled = {
  milliseconds: (milliseconds: number) =>
    t({ message: `${milliseconds} ms`, comment: 'A duration in milliseconds' }),
  seconds: (seconds: number | string) =>
    t({ message: `${seconds} s`, comment: 'A duration in seconds' }),
  minutes: (minutes: number) => t({ message: `${minutes} min`, comment: 'A duration in minutes' }),
  minutesSeconds: (minutes: number, seconds: number) =>
    t({ message: `${minutes} min ${seconds} s`, comment: 'A duration in minutes and seconds' }),
  hours: (hours: number) => t({ message: `${hours} h`, comment: 'A duration in whole hours' }),
  hoursMinutes: (hours: number, minutes: number) =>
    t({ message: `${hours} h ${minutes} min`, comment: 'A duration in hours and minutes' }),
};

/** "41s", "2m 5s", "1h 4m"; with a column limit, a longer reading keeps its larger unit. */
function narrowReading(wholeSeconds: number, limit = Number.POSITIVE_INFINITY): string {
  if (wholeSeconds < 60) return narrow.seconds(wholeSeconds);
  const minutes = Math.floor(wholeSeconds / 60);
  if (minutes < 60) {
    const seconds = wholeSeconds % 60;
    const reading = seconds ? narrow.minutesSeconds(minutes, seconds) : narrow.minutes(minutes);
    return reading.length > limit ? narrow.minutes(minutes) : reading;
  }
  const hours = Math.floor(minutes / 60);
  const reading = minutes % 60 ? narrow.hoursMinutes(hours, minutes % 60) : narrow.hours(hours);
  return reading.length > limit ? narrow.hours(hours) : reading;
}

/** "1s", "42s", "9m", "2h": one rounded unit. */
function singleNarrowUnit(elapsed: number): string {
  if (elapsed < MILLISECONDS_PER_MINUTE) {
    return narrow.seconds(Math.max(1, Math.round(elapsed / MILLISECONDS_PER_SECOND)));
  }
  if (elapsed < MILLISECONDS_PER_HOUR) {
    return narrow.minutes(Math.round(elapsed / MILLISECONDS_PER_MINUTE));
  }
  return narrow.hours(Math.round(elapsed / MILLISECONDS_PER_HOUR));
}

/** "840 ms", "9 s", "2 min 30 s", "1 h 5 min". */
function spelledReading(elapsed: number, style: 'unit' | 'tenths' | 'wall'): string {
  if (style !== 'wall' && elapsed < MILLISECONDS_PER_SECOND) {
    return spelled.milliseconds(Math.round(elapsed));
  }
  const wholeSeconds = (style === 'wall' ? Math.floor : Math.round)(
    elapsed / MILLISECONDS_PER_SECOND,
  );
  if (elapsed < MILLISECONDS_PER_MINUTE) {
    return style === 'tenths'
      ? spelled.seconds(formatNumber(elapsed / MILLISECONDS_PER_SECOND, 1))
      : spelled.seconds(wholeSeconds);
  }
  if (wholeSeconds < SECONDS_PER_HOUR) {
    const minutes = Math.floor(wholeSeconds / 60);
    const seconds = wholeSeconds % 60;
    return seconds ? spelled.minutesSeconds(minutes, seconds) : spelled.minutes(minutes);
  }
  const totalMinutes = Math.round(wholeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? spelled.hoursMinutes(hours, minutes) : spelled.hours(hours);
}

/** Formats an elapsed duration in milliseconds for display. */
export function formatDuration(milliseconds: number, style: DurationStyle = 'unit'): string {
  const elapsed = Math.max(0, milliseconds);
  const seconds = elapsed / MILLISECONDS_PER_SECOND;
  switch (style) {
    case 'short':
      return narrowReading(Math.round(seconds));
    case 'elapsed':
      return seconds < 9.95
        ? narrow.seconds(oneDecimal(seconds))
        : narrowReading(Math.round(seconds), ELAPSED_COLUMN_CHARACTERS);
    case 'trailing':
      if (elapsed < MILLISECONDS_PER_SECOND) return narrow.milliseconds(Math.round(elapsed));
      return seconds < 10 ? narrow.seconds(formatNumber(seconds, 1)) : singleNarrowUnit(elapsed);
    case 'compact':
      return singleNarrowUnit(elapsed);
    default:
      return spelledReading(elapsed, style);
  }
}

/**
 * Cuts `value` to at most `limit` characters, spending the last character on an
 * ellipsis so the rendered string never exceeds the budget it was given.
 */
export function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;
}
