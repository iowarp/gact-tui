import type { DocumentAnchor } from '@clio/core/v3';

/** Characters of context kept before and after a selection (comments.context_chars). */
export const CONTEXT_CHARS = 64;

const collapse = (text: string) => text.replace(/\s+/gu, ' ');

/**
 * A `text-quote` anchor for the selection inside `container`: the exact text, up to 64
 * characters before and after it, and its offsets in the container's rendered text, so the
 * server can find it again when the text appears more than once (comments plan, anchors).
 */
export function textQuoteFromSelection(
  container: HTMLElement,
  selection: Selection | null = window.getSelection(),
): DocumentAnchor | undefined {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return undefined;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return undefined;
  const exact = collapse(rangeText(range)).trim();
  if (!exact) return undefined;
  const before = document.createRange();
  before.selectNodeContents(container);
  before.setEnd(range.startContainer, range.startOffset);
  const prefixText = collapse(rangeText(before));
  const after = document.createRange();
  after.selectNodeContents(container);
  after.setStart(range.endContainer, range.endOffset);
  const suffixText = collapse(rangeText(after));
  const start = prefixText.length;
  return {
    profile: 'text-quote',
    exact,
    prefix: prefixText.slice(-CONTEXT_CHARS),
    suffix: suffixText.slice(0, CONTEXT_CHARS),
    start,
    end: start + exact.length,
  };
}

/**
 * The text a range covers as the document's own text: content marked `data-comment-skip`
 * (a source view's line numbers and problem icons) is left out, and each `data-line` row
 * starts a new line, so the quote and its context match the file.
 */
function rangeText(range: Range): string {
  const common = range.commonAncestorContainer;
  if (common.nodeType === Node.TEXT_NODE) {
    if (common.parentElement?.closest('[data-comment-skip]')) return '';
    return range.toString();
  }
  const walker = document.createTreeWalker(common, NodeFilter.SHOW_TEXT);
  let text = '';
  let row: Element | null | undefined;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node)) continue;
    const parent = node.parentElement;
    if (parent?.closest('[data-comment-skip]')) continue;
    const here = parent?.closest('[data-line]') ?? null;
    if (row !== undefined && here !== row) text += '\n';
    row = here;
    let part = node.textContent ?? '';
    if (node === range.endContainer) part = part.slice(0, range.endOffset);
    if (node === range.startContainer) part = part.slice(range.startOffset);
    text += part;
  }
  return text;
}

interface TextPoint {
  node: Text;
  offset: number;
}

/**
 * The container's text as `textQuoteFromSelection` reads it (skipped content left out, a
 * newline between `data-line` rows, whitespace runs collapsed), with the DOM point behind
 * each character, so a quote can be found again and turned back into a range.
 */
function containerText(container: HTMLElement): { text: string; points: TextPoint[] } {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let text = '';
  const points: TextPoint[] = [];
  let row: Element | null | undefined;
  const push = (char: string, point: TextPoint) => {
    const space = /\s/u.test(char);
    if (space && text.endsWith(' ')) return;
    text += space ? ' ' : char;
    points.push(point);
  };
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement;
    if (parent?.closest('[data-comment-skip]')) continue;
    const here = parent?.closest('[data-line]') ?? null;
    if (row !== undefined && here !== row) push('\n', { node, offset: 0 });
    row = here;
    const value = node.textContent ?? '';
    for (let offset = 0; offset < value.length; offset += 1) push(value[offset]!, { node, offset });
  }
  return { text, points };
}

/**
 * The range a `text-quote` anchor marks inside `container`, found again in its current
 * text: the occurrence nearest the anchor's recorded offset, so a quote that appears twice
 * is drawn where it was made. Undefined when the text is no longer there.
 */
export function textQuoteRange(container: HTMLElement, anchor: DocumentAnchor): Range | undefined {
  const exact = anchor.exact ? collapse(anchor.exact) : '';
  if (!exact) return undefined;
  const { text, points } = containerText(container);
  let best = -1;
  for (let at = text.indexOf(exact); at >= 0; at = text.indexOf(exact, at + 1)) {
    if (best < 0 || Math.abs(at - (anchor.start ?? 0)) < Math.abs(best - (anchor.start ?? 0)))
      best = at;
  }
  if (best < 0) return undefined;
  const first = points[best]!;
  const last = points[best + exact.length - 1]!;
  const range = document.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  return range;
}

/** The boxes of the text a range covers, one per line of each text node, without its gaps. */
export function textRangeRects(range: Range): DOMRect[] {
  const common = range.commonAncestorContainer;
  const root = common.nodeType === Node.TEXT_NODE ? common.parentNode! : common;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const rects: DOMRect[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node) || node.parentElement?.closest('[data-comment-skip]')) continue;
    const part = document.createRange();
    part.selectNodeContents(node);
    if (node === range.startContainer) part.setStart(node, range.startOffset);
    if (node === range.endContainer) part.setEnd(node, range.endOffset);
    for (const rect of typeof part.getClientRects === 'function' ? part.getClientRects() : []) {
      if (rect.width > 0 && rect.height > 0) rects.push(rect);
    }
  }
  return rects;
}
