import type { AttentionAvailable } from '@clio/core/v3';
import { findRunInRenderedText, projectText } from './attention-text';
import {
  type AttentionHeatReduction,
  type AttentionHeatUnit,
  SEGMENT_HEAT_LEVELS,
  lineHeat,
  segmentLevel,
  tokenHeat,
  toolSections,
  wordHeat,
} from './attention-segment-heat';
import type { ResolvedAttentionBlock } from './attention-highlight-sources';
import { transcriptSourceStart } from './transcript-content-selection';

/** A stretch of source text and the heat level it is painted at. */
interface LeveledSpan {
  lo: number;
  hi: number;
  bucket: number;
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
  /** Ranges per level, index 0 (never painted) through 9. */
  heat: Range[][];
  /** The same levels for tool calls: tool blocks, and `>>>` calls written in text. */
  toolHeat: Range[][];
}

function findRenderedRun(
  element: Element,
  sourceText: string,
  lo: number,
  hi: number,
  domProjection: ReturnType<typeof projectText>,
  searchFrom = 0,
) {
  const sourceStart = transcriptSourceStart(element);
  const prefixLength = [...sourceText.slice(0, sourceStart)].length;
  return findRunInRenderedText(
    sourceText.slice(sourceStart),
    Math.max(0, lo - prefixLength),
    hi - prefixLength,
    domProjection,
    searchFrom,
  );
}

/**
 * Adds one `Range` per span of a mounted block to `heat[span.bucket]`. A block
 * whose element is not in the DOM (virtualized away, or not yet streamed in)
 * is skipped for this pass; a later pass over the same data picks it up once
 * it mounts.
 */
function paintBlock(
  container: ParentNode,
  block: ResolvedAttentionBlock['block'],
  sourceText: string,
  spans: readonly LeveledSpan[],
  heat: Range[][],
) {
  const element = findPartElement(container, block.message_id, block.part_id, block.field);
  if (!element) return;
  const domProjection = projectText(element.textContent ?? '', { source: false });
  if (!domProjection.text) return;
  let searchFrom = 0;
  for (const span of spans) {
    const found = findRenderedRun(element, sourceText, span.lo, span.hi, domProjection, searchFrom);
    if (!found) continue;
    searchFrom = found.projectedEnd;
    const range = rangeFromTextOffsets(element, found.domLo, found.domHi);
    if (range) heat[span.bucket]?.push(range);
  }
}

/**
 * Heat valued like SPOTTER's text maps. A segment is a source line
 * (`render_heatmap.py`), a first-level word (`render_pretoken_heatmap.py`) or
 * one kept model token; lines and words combine their tokens (`reduction`),
 * and every segment is scaled to the hottest one across the shown blocks on
 * the same levels 0..9, whatever the unit. Level 0 and
 * whitespace-only segments are left unpainted, so neighbouring bands keep a
 * visible edge: a rendered paragraph written over several source lines carries
 * one band per line.
 */
export function buildSegmentHighlightRanges(
  container: ParentNode,
  resolved: readonly ResolvedAttentionBlock[],
  unit: AttentionHeatUnit,
  reduction: AttentionHeatReduction,
): AttentionHighlightRanges {
  const blocks = resolved.map((entry) => {
    const { sourceText, block } = entry;
    const segments =
      unit === 'token'
        ? tokenHeat(sourceText, block.runs)
        : (unit === 'line' ? lineHeat : wordHeat)(
            sourceText,
            block.runs,
            reduction,
            block.token_starts,
          );
    return { ...entry, segments };
  });
  const max = Math.max(
    0,
    ...blocks.flatMap(({ segments }) => segments.map((segment) => segment.value)),
  );
  const heat: Range[][] = Array.from({ length: SEGMENT_HEAT_LEVELS }, () => []);
  const toolHeat: Range[][] = Array.from({ length: SEGMENT_HEAT_LEVELS }, () => []);
  for (const { block, sourceText, segments } of blocks) {
    const toolBlock = block.kind === 'tool_input' || block.kind === 'tool_result';
    const sections = toolBlock ? [] : toolSections(sourceText);
    const inTool = (at: number) =>
      toolBlock || sections.some((section) => at >= section.lo && at < section.hi);
    const spans = segments
      .filter((segment) => segment.visible)
      .map((segment) => ({
        lo: segment.lo,
        hi: segment.hi,
        bucket: segmentLevel(segment.value, max),
      }))
      .filter((span) => span.bucket > 0 && span.hi > span.lo);
    // One scale for both ramps (max over every segment above), painted separately.
    paintBlock(container, block, sourceText, spans.filter((span) => !inTool(span.lo)), heat);
    paintBlock(container, block, sourceText, spans.filter((span) => inTool(span.lo)), toolHeat);
  }
  return { heat, toolHeat };
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
  const found = findRenderedRun(element, sourceText, start, end, domProjection);
  return found ? rangeFromTextOffsets(element, found.domLo, found.domHi) : undefined;
}
