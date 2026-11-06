import type { AttentionRun } from '@clio/core/v3';

/** Paint heat per source line (the SPOTTER text map) or per token. */
export type AttentionHeatUnit = 'line' | 'token';
/** How a line's measured tokens combine into the line's value. */
export type AttentionLineReduction = 'max' | 'mean';

export interface AttentionHeatView {
  unit: AttentionHeatUnit;
  reduction: AttentionLineReduction;
}

/**
 * Lines by default, valued like SPOTTER's `render_heatmap.py`: a line's value
 * is its hottest measured token.
 */
export const DEFAULT_ATTENTION_HEAT_VIEW: AttentionHeatView = { unit: 'line', reduction: 'max' };

/** `render_heatmap.py` levels 0..9; 0 is not painted. */
export const LINE_HEAT_LEVELS = 10;

/** One source line in Unicode code points; `hi` stops before its line break. */
export interface SourceLine {
  lo: number;
  hi: number;
}

/** A line that holds at least one measured token, with its combined value. */
export interface LineHeat extends SourceLine {
  value: number;
  /** How many measured tokens the value combines. */
  measured: number;
}

/**
 * The `\n`-separated lines of `text`, in the code-point coordinates that heat
 * runs use. A rendered paragraph is usually several of these lines.
 */
export function sourceLines(text: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let lo = 0;
  let at = 0;
  for (const char of text) {
    if (char === '\n') {
      lines.push({ lo, hi: at });
      lo = at + 1;
    }
    at += 1;
  }
  lines.push({ lo, hi: at });
  return lines;
}

/**
 * Combines a block's per-token runs into one value per source line.
 *
 * A token belongs to the line it starts on, as in `render_heatmap.py`, so a
 * token that ends in a line break still counts for the line it closes. Lines
 * without a measured token are left out: unmeasured is not zero.
 */
export function lineHeat(
  text: string,
  runs: readonly AttentionRun[],
  reduction: AttentionLineReduction,
): LineHeat[] {
  const lines = sourceLines(text);
  const totals = lines.map(() => ({ max: 0, sum: 0, measured: 0 }));
  let line = 0;
  const sorted = [...runs].sort((left, right) => left[0] - right[0]);
  for (const [lo, , value] of sorted) {
    if (!Number.isFinite(value)) continue;
    while (line < lines.length - 1 && lo > (lines[line] as SourceLine).hi) line += 1;
    const total = totals[line];
    if (!total) continue;
    total.max = Math.max(total.max, value);
    total.sum += value;
    total.measured += 1;
  }
  const heat: LineHeat[] = [];
  lines.forEach((source, index) => {
    const total = totals[index];
    if (!total?.measured) return;
    const value = reduction === 'max' ? total.max : total.sum / total.measured;
    heat.push({ ...source, value, measured: total.measured });
  });
  return heat;
}

/** `render_heatmap.py`'s level: `round(9 * value / max)`, clamped to 0..9. */
export function lineLevel(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) return 0;
  return Math.max(
    0,
    Math.min(LINE_HEAT_LEVELS - 1, Math.round(((LINE_HEAT_LEVELS - 1) * value) / max)),
  );
}
