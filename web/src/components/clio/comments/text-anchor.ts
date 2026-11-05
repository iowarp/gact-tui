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
