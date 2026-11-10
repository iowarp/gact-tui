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
  return readableText(element);
}

/** Rows whose controls reveal the row's cut text when keyboard focus lands on them. */
const ROW = '[data-slot="item-row"], [data-slot="settings-row"]';

/**
 * The cut text a focused control reveals: its own, or else its row's (a row's
 * path or meta sits beside its Copy and Edit buttons, not inside them).
 */
export function truncatedTextForFocus(control: HTMLElement): HTMLElement[] {
  const own = truncatedTextWithin(control);
  if (own.length) return own;
  const row = control.parentElement?.closest<HTMLElement>(ROW);
  return row ? truncatedTextWithin(row, 160) : [];
}

/** A wide space, so parts the row sets apart with a gap or margin stay apart. */
const PART_GAP = '\u2003';

/**
 * Text as the row reads it. `textContent` glues parts that only a flex gap or a
 * margin separates ("Tool actionOne conversation"); those parts get a gap here.
 */
function readableText(element: HTMLElement): string {
  const parts: string[] = [];
  const walk = (node: Node, gapped: boolean) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        parts.push(child.textContent ?? '');
        continue;
      }
      if (!(child instanceof Element)) continue;
      const style = getComputedStyle(child);
      if (style.display === 'none') continue;
      const apart =
        gapped ||
        style.display !== 'inline' ||
        parseFloat(style.marginLeft) > 0 ||
        parseFloat(style.marginRight) > 0;
      if (apart) parts.push(PART_GAP);
      walk(child, parseFloat(style.columnGap) > 0);
      if (apart) parts.push(PART_GAP);
    }
  };
  walk(element, parseFloat(getComputedStyle(element).columnGap) > 0);
  return parts
    .join('')
    .replace(/[ \t\n\r\f]+/g, ' ')
    .replace(/ ?\u2003[ \u2003]*/g, PART_GAP)
    .replace(/^\u2003|\u2003$/g, '')
    .trim();
}
