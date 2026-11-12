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
  // Parts that clip their own text (a name cut beside a label) overflow only
  // inside themselves; their container is cut only when its scroll width says so.
  if (clipsWithin(element)) return false;
  // scrollWidth rounds, so a sub-pixel cut (just the ellipsis) reads as fitting.
  const range = document.createRange();
  range.selectNodeContents(element);
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  return range.getBoundingClientRect().width > element.clientWidth - padding + 0.5;
}

/** Overflow values that hide what does not fit. */
const CLIPPING = new Set(['hidden', 'clip', 'auto', 'scroll']);

/** Whether an HTML part inside `element` hides its own overflow (icons do not count). */
function clipsWithin(element: HTMLElement): boolean {
  const descendants = element.querySelectorAll('*');
  if (descendants.length > 40) return false;
  return Array.from(descendants).some(
    (part) => part instanceof HTMLElement && CLIPPING.has(getComputedStyle(part).overflowX),
  );
}

/**
 * A line read as one text (`data-truncation-scope`): a state and a name set
 * apart only by spacing. When any part is cut, the whole line is the hint.
 */
const SCOPE = '[data-truncation-scope]';

function scopeCut(scope: HTMLElement): boolean {
  return Array.from(scope.querySelectorAll<HTMLElement>('*')).some(
    (part) => cutsText(part) && isTextTruncated(part),
  );
}

/**
 * The nearest element at or above `start` that cuts its text and is cut now,
 * or the line scope holding it. Stops at `data-truncation-hint="off"` and at
 * editable fields. Text under a `title` is left to the native tooltip, which
 * already reads it on hover.
 */
export function truncatedTextAt(start: EventTarget | null): HTMLElement | null {
  const from = start instanceof Element ? start : start instanceof Node ? start.parentElement : null;
  let node = from;
  for (let depth = 0; node && depth < MAX_DEPTH; depth += 1, node = node.parentElement) {
    if (!(node instanceof HTMLElement) || node === document.body) return null;
    if (node.dataset.truncationHint === 'off' || node.matches(EDITABLE)) return null;
    const scope = node.matches(SCOPE) && scopeCut(node);
    if (scope || (cutsText(node) && isTextTruncated(node))) {
      const cut = scope ? node : (node.closest<HTMLElement>(SCOPE) ?? node);
      // A titled part of a line (its status dot) names itself natively.
      if (cut.matches(SCOPE)) {
        const titled = from?.closest('[title]');
        if (titled && cut.contains(titled)) return null;
      }
      return cut.closest('[title], [data-truncation-hint="off"]') ? null : cut;
    }
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
    if (cutsText(element) && isTextTruncated(element)) {
      const scope = element.closest<HTMLElement>(SCOPE);
      found.push(scope && root.contains(scope) ? scope : element);
    }
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

/** A container whose parts read as one phrase ("Agent @ this computer") marks itself so. */
const gapOf = (element: Element) =>
  element instanceof HTMLElement && element.dataset.truncationGap === 'space' ? ' ' : PART_GAP;

/**
 * Text as the row reads it. `textContent` glues parts that only a flex gap or a
 * margin separates ("Tool actionOne conversation"); those parts get a gap here,
 * or a plain space under `data-truncation-gap="space"`.
 */
function readableText(element: HTMLElement): string {
  const parts: string[] = [];
  const walk = (node: Element, gapped: boolean) => {
    const gap = gapOf(node);
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
      if (apart) parts.push(gap);
      walk(child, parseFloat(style.columnGap) > 0);
      if (apart) parts.push(gap);
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
