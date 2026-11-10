/**
 * Cut text must stay readable. These helpers find text the layout has cut,
 * with an ellipsis (`truncate`) or a line clamp (`line-clamp-*`), so the
 * truncation hint can show it whole on hover or keyboard focus, and only
 * when something is actually hidden.
 */

/** Elements whose text the hint never reads: editors draw their own overflow. */
const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/** How far up from the pointer a truncating element is looked for. */
const MAX_DEPTH = 8;

function lineClamp(style: CSSStyleDeclaration): string {
  return (
    style.getPropertyValue('-webkit-line-clamp') || style.getPropertyValue('line-clamp') || 'none'
  );
}

/** Whether the element cuts its text with an ellipsis or a line clamp. */
export function cutsText(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  if (lineClamp(style) !== 'none') return true;
  return style.textOverflow === 'ellipsis' && style.overflowX !== 'visible';
}

/** Whether a cutting element is hiding part of its text right now. */
export function isTextTruncated(element: HTMLElement): boolean {
  if (!element.isConnected || element.clientWidth === 0) return false;
  const style = getComputedStyle(element);
  if (lineClamp(style) !== 'none') return element.scrollHeight > element.clientHeight + 1;
  if (style.textOverflow !== 'ellipsis') return false;
  if (element.scrollWidth > element.clientWidth) return true;
  // scrollWidth rounds, so a sub-pixel cut (just the ellipsis) reads as fitting.
  const range = document.createRange();
  range.selectNodeContents(element);
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  return range.getBoundingClientRect().width > element.clientWidth - padding + 0.5;
}

/**
 * The nearest element at or above `start` that cuts its text and is cut now.
 * Stops at `data-truncation-hint="off"` and at editable fields. Text under a
 * `title` is left to the native tooltip, which already reads it on hover.
 */
export function truncatedTextAt(start: EventTarget | null): HTMLElement | null {
  let node = start instanceof Element ? start : start instanceof Node ? start.parentElement : null;
  for (let depth = 0; node && depth < MAX_DEPTH; depth += 1, node = node.parentElement) {
    if (!(node instanceof HTMLElement) || node === document.body) return null;
    if (node.dataset.truncationHint === 'off' || node.matches(EDITABLE)) return null;
    if (cutsText(node) && isTextTruncated(node))
      return node.closest('[title], [data-truncation-hint="off"]') ? null : node;
  }
  return null;
}

/**
 * Every cut text inside `root` (itself included), for a focused row or
 * control. Keyboard focus shows no native tooltip, so titled text counts. A
 * focused region (a whole list or log) is not a row and reads nothing.
 */
export function truncatedTextWithin(root: HTMLElement, limit = 60): HTMLElement[] {
  if (root.closest('[data-truncation-hint="off"]') || root.matches(EDITABLE)) return [];
  const descendants = root.querySelectorAll<HTMLElement>('*');
  if (descendants.length > limit) return [];
  const found: HTMLElement[] = [];
  for (const element of [root, ...Array.from(descendants)]) {
    if (element.closest('[data-truncation-hint="off"]')) continue;
    if (found.some((outer) => outer.contains(element))) continue;
    if (cutsText(element) && isTextTruncated(element)) found.push(element);
  }
  return found;
}

/** The whole text of a cut element: its `data-full-text`, or what it holds. */
export function fullTextOf(element: HTMLElement): string {
  const declared = element.dataset.fullText?.trim();
  if (declared) return declared;
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}
