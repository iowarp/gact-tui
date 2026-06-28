/**
 * Numeric/cost/duration presentation helpers. Consolidates the inline
 * `toFixed(...)` formatting that was duplicated (with drifting precision) across
 * the inspector, chat chips, metrics, session list, and search panels. Each
 * helper preserves the exact precision the original call sites used so the
 * rendered output is byte-for-byte identical.
 */

/** Per-turn / total cost in USD, 4 decimal places (e.g. `0.0123`). */
export function formatCostUsd(usd: number): string {
  return usd.toFixed(4);
}

/**
 * Session-summary cost in USD, 3 decimal places. The session-list chip
 * deliberately renders one digit coarser than the per-turn cost.
 */
export function formatSessionCost(usd: number): string {
  return usd.toFixed(3);
}

/** Duration in milliseconds rendered as seconds, 1 decimal place. */
export function formatDurationSeconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

/** Fraction in [0..1] rendered as a whole-number percentage. */
export function formatPercentage(fraction: number): string {
  return (fraction * 100).toFixed(0);
}

/** Relevance/search score, 2 decimal places. */
export function formatScore(score: number): string {
  return score.toFixed(2);
}

/**
 * Locale time-of-day for an ISO timestamp, matching the inspector's previous
 * `new Date(iso).toLocaleTimeString()` call sites byte-for-byte (invalid input
 * renders the engine's `Invalid Date`, unguarded, exactly as before).
 */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString();
}

/**
 * Absolute message timestamp: `Jun 22, 2026, 12:00:00 PM`-style locale string
 * with explicit field widths. Invalid input is passed through unchanged, as the
 * message header previously did.
 */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Locale-grouped integer (thousands separators) for counts/totals. Replaces the
 * bare `n.toLocaleString()` calls in the metrics/memory readouts; identical
 * output for the same locale.
 */
export function formatCount(n: number): string {
  return n.toLocaleString();
}
