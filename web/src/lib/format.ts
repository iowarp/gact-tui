/**
 * Shared display formatters.
 *
 * Sizes, durations, and truncated prose are rendered on many surfaces. Each one
 * has exactly one implementation here so the same byte count, the same elapsed
 * time, and the same overlong summary read identically wherever they appear.
 */

const BYTES_PER_KILOBYTE = 1_000;
const MILLISECONDS_PER_SECOND = 1_000;
const MILLISECONDS_PER_MINUTE = 60_000;

const BYTE_UNITS = ['KB', 'MB', 'GB', 'TB'] as const;

/**
 * Formats a byte count with SI (decimal) units, matching the `KB`/`MB`/`GB`
 * labels every surface renders. Byte counts on the wire are decimal, so a
 * binary divisor would print a number that does not match its own label.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '';
  const magnitude = Math.abs(bytes);
  if (magnitude < BYTES_PER_KILOBYTE) return `${Math.round(bytes)} B`;
  let value = bytes / BYTES_PER_KILOBYTE;
  let index = 0;
  while (Math.abs(value) >= BYTES_PER_KILOBYTE && index < BYTE_UNITS.length - 1) {
    value /= BYTES_PER_KILOBYTE;
    index += 1;
  }
  return `${value.toFixed(1)} ${BYTE_UNITS[index]}`;
}

/**
 * How a duration is written out.
 *
 * - `unit`: spelled-out units for reading surfaces — `840 ms`, `9 s`,
 *   `2 min 30 s`.
 * - `tenths`: same, but keeps one decimal below a minute where sub-second
 *   differences matter (tool timings).
 * - `compact`: single-letter units with no space, for badges inside a graph
 *   node or another space-constrained glyph.
 */
export type DurationStyle = 'unit' | 'tenths' | 'compact';

/** Formats an elapsed duration in milliseconds for display. */
export function formatDuration(milliseconds: number, style: DurationStyle = 'unit'): string {
  const elapsed = Math.max(0, milliseconds);
  if (style === 'compact') {
    if (elapsed < MILLISECONDS_PER_MINUTE) {
      return `${Math.max(1, Math.round(elapsed / MILLISECONDS_PER_SECOND))}s`;
    }
    return `${Math.round(elapsed / MILLISECONDS_PER_MINUTE)}m`;
  }
  if (elapsed < MILLISECONDS_PER_SECOND) return `${Math.round(elapsed)} ms`;
  if (elapsed < MILLISECONDS_PER_MINUTE) {
    const seconds = elapsed / MILLISECONDS_PER_SECOND;
    return style === 'tenths'
      ? `${seconds.toFixed(1).replace(/\.0$/u, '')} s`
      : `${Math.round(seconds)} s`;
  }
  const minutes = Math.floor(elapsed / MILLISECONDS_PER_MINUTE);
  const seconds = Math.round((elapsed % MILLISECONDS_PER_MINUTE) / MILLISECONDS_PER_SECOND);
  return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

/**
 * Cuts `value` to at most `limit` characters, spending the last character on an
 * ellipsis so the rendered string never exceeds the budget it was given.
 */
export function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;
}
