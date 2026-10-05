import type { AttentionAvailable, AttentionRun } from '@clio/core/v3';
import { bucketIntensity, findRunInRenderedText, projectText } from './attention-text';
import type { ResolvedAttentionBlock } from './attention-highlight-sources';

/** One heat run reduced to its intensity bucket, before merging adjacents. */
interface BucketedRun {
  lo: number;
  hi: number;
  bucket: number;
}

/**
 * Buckets every run's value, then merges adjacent (touching or overlapping)
 * runs that land in the same bucket into one. A tool result can carry
 * thousands of small runs; merging first keeps the number of `Range` objects
 * (and the highlight paint cost) proportional to visible heat regions, not to
 * raw run count.
 */
export function mergeRunsByBucket(
  runs: readonly AttentionRun[],
  maxValue: number,
  levels = 4,
): BucketedRun[] {
  const bucketed = runs
    .map(([lo, hi, value]) => ({ lo, hi, bucket: bucketIntensity(value, maxValue, levels) }))
    .sort((left, right) => left.lo - right.lo || left.hi - right.hi);
  const merged: BucketedRun[] = [];
  for (const run of bucketed) {
    const last = merged.at(-1);
    if (last && last.bucket === run.bucket && run.lo <= last.hi) {
      last.hi = Math.max(last.hi, run.hi);
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replaceAll(/[^a-zA-Z0-9_-]/gu, '\\$&');
}

/** Locates the rendered element for one message part's field, inside a mounted transcript container. */
export function findPartElement(
  container: ParentNode,
  messageId: string,
  partId: string,
  field: string,
): Element | null {
  const exact = container.querySelector(
    `[data-message-id="${cssEscape(messageId)}"][data-part-id="${cssEscape(partId)}"][data-field="${cssEscape(field)}"]`,
  );
  if (exact) return exact;
  const messageRoot = container.querySelector(`[data-message-id="${cssEscape(messageId)}"]`);
  if (!messageRoot) return null;
  return messageRoot.querySelector(
    `[data-part-id="${cssEscape(partId)}"][data-field="${cssEscape(field)}"]`,
  );
}

/** A `Range` spanning raw character offsets `[lo, hi)` of `element`'s text content, or `undefined` if out of bounds. */
export function rangeFromTextOffsets(element: Node, lo: number, hi: number): Range | undefined {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let startNode: Text | undefined;
  let startOffset = 0;
  let endNode: Text | undefined;
  let endOffset = 0;
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    const length = text.data.length;
    if (!startNode && consumed + length > lo) {
      startNode = text;
      startOffset = lo - consumed;
    }
    if (consumed + length >= hi) {
      endNode = text;
      endOffset = hi - consumed;
      break;
    }
    consumed += length;
    node = walker.nextNode();
  }
  if (!startNode || !endNode) return undefined;
  const range = document.createRange();
  range.setStart(startNode, Math.max(0, startOffset));
  range.setEnd(endNode, Math.max(0, endOffset));
  return range;
}

export interface AttentionHighlightRanges {
  /** Ranges per intensity bucket, index 0 (lowest) through `levels - 1`. */
  heat: Range[][];
}

/**
 * Builds the `Range`s for every resolved attention block currently mounted in
 * `container`. A block whose element is not in the DOM (virtualized away, or
 * not yet streamed in) is silently skipped for this pass; a later pass over
 * the same data picks it up once it mounts.
 */
export function buildAttentionHighlightRanges(
  container: ParentNode,
  resolved: readonly ResolvedAttentionBlock[],
  maxValue: number,
  levels = 4,
): AttentionHighlightRanges {
  const heat: Range[][] = Array.from({ length: levels }, () => []);
  for (const { block, sourceText } of resolved) {
    const element = findPartElement(container, block.message_id, block.part_id, block.field);
    if (!element) continue;
    const domProjection = projectText(element.textContent ?? '', { source: false });
    if (!domProjection.text) continue;
    let searchFrom = 0;
    for (const run of mergeRunsByBucket(block.runs, maxValue, levels)) {
      const found = findRunInRenderedText(sourceText, run.lo, run.hi, domProjection, searchFrom);
      if (!found) continue;
      searchFrom = found.projectedEnd;
      const range = rangeFromTextOffsets(element, found.domLo, found.domHi);
      if (range) heat[run.bucket]?.push(range);
    }
  }
  return { heat };
}

/**
 * The `Range` for the exact selected span itself, when the payload echoes
 * back where it lives. `sourceText` is the selected part's raw source text
 * (resolved from the live transcript, the same way any other block is), since
 * `start`/`end` are offsets into that source, not into the rendered DOM text.
 */
export function buildSelectedRange(
  container: ParentNode,
  data: AttentionAvailable,
  sourceText: string | undefined,
): Range | undefined {
  const { part_id: partId, field, start, end } = data.selection;
  if (!partId || !field || start === undefined || end === undefined || !sourceText)
    return undefined;
  const element = findPartElement(container, data.message_id, partId, field);
  if (!element) return undefined;
  const domProjection = projectText(element.textContent ?? '', { source: false });
  const found = findRunInRenderedText(sourceText, start, end, domProjection);
  return found ? rangeFromTextOffsets(element, found.domLo, found.domHi) : undefined;
}
