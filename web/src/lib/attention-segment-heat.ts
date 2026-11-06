import type { AttentionRun } from '@clio/core/v3';

/**
 * What one band of heat covers: a source line (SPOTTER's `render_heatmap.py`),
 * a word as the tokenizer's first level cuts it (`render_pretoken_heatmap.py`),
 * or a single model token.
 */
export type AttentionHeatUnit = 'line' | 'word' | 'token';
/** How a segment's measured tokens combine into its value. */
export type AttentionHeatReduction = 'max' | 'mean';

export interface AttentionHeatView {
  unit: AttentionHeatUnit;
  reduction: AttentionHeatReduction;
}

/**
 * Lines by default, valued like SPOTTER's `render_heatmap.py`: a line's value
 * is its hottest measured token.
 */
export const DEFAULT_ATTENTION_HEAT_VIEW: AttentionHeatView = { unit: 'line', reduction: 'max' };

/** SPOTTER's ramp levels 0..9; 0 is not painted. */
export const SEGMENT_HEAT_LEVELS = 10;

/** A stretch of source text in Unicode code points, `[lo, hi)`. */
export interface Segment {
  lo: number;
  hi: number;
}

/** A segment that holds at least one measured token, with its combined value. */
export interface SegmentHeat extends Segment {
  value: number;
  /** How many measured tokens the value combines. */
  measured: number;
  /** Whether the segment has visible text to paint (a whitespace run has none). */
  visible: boolean;
}

/**
 * The `\n`-separated lines of `text`, in the code-point coordinates that heat
 * runs use; each stops before its line break. A rendered paragraph is usually
 * several of these lines.
 */
export function sourceLines(text: string): Segment[] {
  const lines: Segment[] = [];
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
 * The GPT-2 first level, Granite's own pre-tokenizer: contractions, words and
 * numbers with one leading space, runs of other characters, and runs of
 * whitespace. BPE then splits these further into model tokens.
 */
const FIRST_LEVEL = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;
const CONTENT = /[\p{L}\p{N}]/u;

/**
 * The first-level pieces of `text` (SPOTTER's `render_pretoken_heatmap.py`),
 * tiling it in code points. Every model token lies inside one of them, or,
 * when a model's own pieces differ, straddles two.
 */
export function preTokens(text: string): Segment[] {
  const out: Segment[] = [];
  let units = 0;
  let points = 0;
  FIRST_LEVEL.lastIndex = 0;
  for (const match of text.matchAll(FIRST_LEVEL)) {
    // Advance the code-point count to the match start, then across the match.
    points += [...text.slice(units, match.index)].length;
    const length = [...match[0]].length;
    out.push({ lo: points, hi: points + length });
    points += length;
    units = match.index + match[0].length;
  }
  return out;
}

function combine(
  text: readonly string[],
  runs: readonly AttentionRun[],
  segments: readonly Segment[],
  reduction: AttentionHeatReduction,
  owner: (lo: number, hi: number) => number,
): SegmentHeat[] {
  const totals = segments.map(() => ({ max: 0, sum: 0, measured: 0 }));
  for (const [lo, hi, value] of runs) {
    if (!Number.isFinite(value)) continue;
    const total = totals[owner(lo, hi)];
    if (!total) continue;
    total.max = Math.max(total.max, value);
    total.sum += value;
    total.measured += 1;
  }
  const heat: SegmentHeat[] = [];
  segments.forEach((segment, index) => {
    const total = totals[index];
    if (!total?.measured) return;
    let lo = segment.lo;
    while (lo < segment.hi && /\s/u.test(text[lo] ?? '')) lo += 1;
    heat.push({
      lo,
      hi: segment.hi,
      value: reduction === 'max' ? total.max : total.sum / total.measured,
      measured: total.measured,
      visible: lo < segment.hi,
    });
  });
  return heat;
}

/** Index of the last segment starting at or before `at`. */
function segmentAt(segments: readonly Segment[], at: number): number {
  let low = 0;
  let high = segments.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((segments[middle] as Segment).lo <= at) low = middle;
    else high = middle - 1;
  }
  return low;
}

/**
 * One value per source line. A token belongs to the line it starts on, as in
 * `render_heatmap.py`, so a token that ends in a line break counts for the line
 * it closes. Lines without a measured token are left out: unmeasured is not zero.
 */
export function lineHeat(
  text: string,
  runs: readonly AttentionRun[],
  reduction: AttentionHeatReduction,
): SegmentHeat[] {
  const lines = sourceLines(text);
  // A line's range stops before its break; the break itself belongs to it.
  const owners = lines.map((line, index) => ({ lo: line.lo, hi: lines[index + 1]?.lo ?? line.hi }));
  return combine([...text], runs, lines, reduction, (lo) => segmentAt(owners, lo));
}

/**
 * One value per first-level word (`render_pretoken_heatmap.py`). A token that
 * straddles two words goes to the one holding its letters or digits, then its
 * other visible characters, then the longer share, as that script does.
 */
export function wordHeat(
  text: string,
  runs: readonly AttentionRun[],
  reduction: AttentionHeatReduction,
): SegmentHeat[] {
  const points = [...text];
  const words = preTokens(text);
  const owner = (lo: number, hi: number) => {
    const first = segmentAt(words, lo);
    const last = Math.max(first, segmentAt(words, Math.max(lo, hi - 1)));
    if (first === last) return first;
    let best = first;
    let bestWeight: [number, number] = [-1, -1];
    for (let index = first; index <= last; index += 1) {
      const word = words[index] as Segment;
      const piece = points.slice(Math.max(lo, word.lo), Math.min(hi, word.hi)).join('');
      const weight: [number, number] = [
        CONTENT.test(piece) ? 2 : piece.trim() ? 1 : 0,
        piece.length,
      ];
      if (weight[0] > bestWeight[0] || (weight[0] === bestWeight[0] && weight[1] > bestWeight[1])) {
        best = index;
        bestWeight = weight;
      }
    }
    return best;
  };
  return combine(points, runs, words, reduction, owner);
}

/** SPOTTER's level: `round(9 * value / max)`, clamped to 0..9. */
export function segmentLevel(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) return 0;
  return Math.max(
    0,
    Math.min(SEGMENT_HEAT_LEVELS - 1, Math.round(((SEGMENT_HEAT_LEVELS - 1) * value) / max)),
  );
}
