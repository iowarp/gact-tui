/**
 * Map an attention run's character offsets (into a message part's *source*
 * text: `part.text`, `part.thought`, `JSON.stringify(part.input)`, or a tool
 * result's text) onto the *rendered* DOM text of that same part, so a heat run
 * can become a `Range`.
 *
 * A markdown renderer drops emphasis markers, list bullets, heading hashes,
 * table pipes, code backticks, blockquote markers and link targets, and
 * reflows whitespace. This is the same fixed, one-rule-set projection the
 * server uses to align a person's rendered selection back onto source text
 * (clio-agent `src/clio_agent/gact/attention/rendered.py`): drop markup
 * characters, collapse whitespace runs to one space, and keep, per kept
 * character, its offset in the original string. Projecting both the raw
 * source substring for a run and the live DOM text the same way turns
 * "find this run in the DOM" into a plain substring search.
 */

/** Characters markdown renders away (emphasis, code, headings, quotes, tables). */
const MARKUP_CHARS = new Set(['*', '_', '`', '#', '>', '|', '~']);
/** Line-leading list markers ("- item", "1. item"), rendered as bullets/numbers. */
const LIST_MARKER = /^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/gmu;
/** The "(target)" half of a markdown link or image; only the label renders. */
const LINK_TARGET = /\]\([^)\s]*(?:\s+"[^"]*")?\)/gu;

export interface TextProjection {
  /** Markup dropped, whitespace collapsed to single spaces. */
  text: string;
  /**
   * `index[i]` is the offset in the original string of `text[i]`. Monotonically
   * non-decreasing: a collapsed whitespace run and the real character right
   * after it can share the same source offset (the character that closed the
   * run), so two consecutive entries are occasionally equal.
   */
  index: number[];
}

/**
 * Project `text` onto its markup-free, whitespace-collapsed form.
 *
 * `source: true` also strips list markers and link targets, which is correct
 * for markdown *source* text; rendered DOM text never contains them in the
 * first place (they became real bullets and `href`s), so the DOM side always
 * projects with `source: false`.
 */
export function projectText(text: string, options: { source: boolean }): TextProjection {
  const keep = new Array<boolean>(text.length).fill(true);
  if (options.source) {
    for (const pattern of [LIST_MARKER, LINK_TARGET]) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      // eslint-disable-next-line no-cond-assign
      while ((match = pattern.exec(text))) {
        let lo = match.index;
        const hi = lo + match[0].length;
        if (pattern === LINK_TARGET) {
          // Keep nothing of "(target)"; the "]" right before it is markup too.
          lo += 1;
          keep[lo - 1] = false;
        }
        for (let i = lo; i < hi; i += 1) keep[i] = false;
        if (match[0].length === 0) pattern.lastIndex += 1;
      }
    }
  }
  const out: string[] = [];
  const index: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (!keep[i] || MARKUP_CHARS.has(ch) || ch === '[' || ch === ']') continue;
    if (/\s/u.test(ch)) {
      pendingSpace = out.length > 0;
      continue;
    }
    if (pendingSpace) {
      out.push(' ');
      index.push(i);
      pendingSpace = false;
    }
    out.push(ch);
    index.push(i);
  }
  return { text: out.join(''), index };
}

/**
 * Locate the rendered-DOM character range `[domLo, domHi)` for a heat run's
 * raw source offsets `[charLo, charHi)`, by projecting the run's own source
 * substring and searching for it inside the DOM text's projection (also
 * cached, since one part usually carries many runs).
 *
 * `searchFrom` lets a caller walk runs in order without an earlier run's
 * projected text (e.g. a lone "the") matching a later position by accident.
 * Returns `undefined` when the run's projection is empty or not found.
 */
export function findRunInRenderedText(
  sourceText: string,
  charLo: number,
  charHi: number,
  domProjection: TextProjection,
  searchFrom = 0,
): { domLo: number; domHi: number; projectedEnd: number } | undefined {
  const points = [...sourceText];
  if (charLo < 0 || charHi > points.length || charHi <= charLo) return undefined;
  const sourceLo = points.slice(0, charLo).join('').length;
  const sourceHi = points.slice(0, charHi).join('').length;
  const source = projectText(sourceText, { source: true });
  // A substring match cannot distinguish repeated words or a stale rendering.
  // Match the entire part before mapping its exact Unicode-point coordinates.
  if (!source.text || source.text !== domProjection.text) return undefined;
  const lo = source.index.findIndex((offset) => offset >= sourceLo);
  const after = source.index.findIndex((offset) => offset >= sourceHi);
  const hi = after < 0 ? source.index.length : after;
  if (lo < searchFrom || lo < 0 || hi <= lo) return undefined;
  const domLo = domProjection.index[lo] as number;
  const domHi = (domProjection.index[hi - 1] as number) + 1;
  return { domLo, domHi, projectedEnd: hi };
}

/**
 * Bucket `value` into one of `levels` intensity buckets (0 = lowest) relative
 * to `max`. A non-positive `max`, or a non-finite `value`, buckets to 0 — a
 * missing signal is "no heat", never a crash or a fabricated high bucket.
 */
export function bucketIntensity(value: number, max: number, levels = 4): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) return 0;
  const fraction = Math.min(1, value / max);
  const bucket = Math.floor(fraction * levels);
  return Math.max(0, Math.min(levels - 1, bucket === levels ? levels - 1 : bucket));
}

/**
 * Formats a 0..1 share as a percentage string, one decimal place, never
 * rounding a real positive share down to a misleading "0.0%".
 */
export function formatSharePercent(share: number): string {
  if (share > 0 && share < 0.0005) return '<0.1%';
  return `${(share * 100).toFixed(1)}%`;
}

/** The highest single run value across every block, the denominator `bucketIntensity` scales against. */
export function maxRunValue(
  blocks: readonly { runs: readonly (readonly [number, number, number])[] }[],
): number {
  let max = 0;
  for (const block of blocks) {
    for (const [, , value] of block.runs) {
      if (value > max) max = value;
    }
  }
  return max;
}
