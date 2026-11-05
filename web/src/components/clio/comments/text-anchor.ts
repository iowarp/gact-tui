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
  const exact = collapse(range.toString()).trim();
  if (!exact) return undefined;
  const before = document.createRange();
  before.selectNodeContents(container);
  before.setEnd(range.startContainer, range.startOffset);
  const prefixText = collapse(before.toString());
  const after = document.createRange();
  after.selectNodeContents(container);
  after.setStart(range.endContainer, range.endOffset);
  const suffixText = collapse(after.toString());
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
