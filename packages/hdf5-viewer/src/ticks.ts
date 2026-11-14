/**
 * h5web asks each axis for at least three ticks, and d3 rounds that up to a
 * "nice" step: a 4096-wide axis in a phone-width plot gets five "1e+3"-style
 * labels in about 120px, written over each other. Where an axis's labels
 * would touch, keep every second one (then every third, …), always from the
 * first, so the ones shown stay evenly spaced. Tick marks keep their place.
 *
 * h5web formats ticks with three significant digits, so whole indices from
 * 1000 read "1e+3"; below 1e5 they are written out ("1000") instead.
 */

const AXES = '.visx-axis-bottom, .visx-axis-top, .visx-axis-left, .visx-axis-right';
/** Read by viewer.css, which hides the label. */
export const THINNED = 'data-viewer-tick-thinned';
/** The least space between two labels side by side, in CSS pixels. */
const GAP = 12;
/** The least space between two stacked labels, in CSS pixels. */
const STACKED_GAP = 4;
const PLAIN_BELOW = 1e5;
const EXPONENT = /^([-\u2212]?)(\d+(?:\.\d+)?)e\+(\d+)$/u;

/** A whole number below 1e5 in d3's exponent form, written out; else undefined. */
export function plainTick(label: string): string | undefined {
  const match = EXPONENT.exec(label.trim());
  if (!match) return undefined;
  const value = Number(`${match[2]}e${match[3]}`);
  if (!Number.isInteger(value) || value >= PLAIN_BELOW) return undefined;
  return `${match[1]}${value}`;
}

function rewrite(label: Element): void {
  // React owns the label's one text node and resets it when the tick changes.
  const text = label.firstChild;
  if (!text || text.nodeType !== text.TEXT_NODE || label.childNodes.length !== 1) return;
  const plain = plainTick(text.nodeValue ?? '');
  if (plain !== undefined && plain !== text.nodeValue) text.nodeValue = plain;
}

function crowded(labels: readonly Element[], horizontal: boolean): boolean {
  let previous: DOMRect | undefined;
  for (const label of labels) {
    const rect = label.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    if (previous) {
      const gap = horizontal ? rect.left - previous.right : rect.top - previous.bottom;
      if (gap < (horizontal ? GAP : STACKED_GAP)) return true;
    }
    previous = rect;
  }
  return false;
}

/** Show the most labels of one axis that don't touch. */
export function thinAxis(axis: Element): void {
  const horizontal = /visx-axis-(bottom|top)/u.test(axis.getAttribute('class') ?? '');
  const labels = [...axis.querySelectorAll('.visx-axis-tick text')];
  for (const label of labels) rewrite(label);
  const order = (a: Element, b: Element) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return horizontal ? ra.left - rb.left : ra.top - rb.top;
  };
  for (const label of labels) label.removeAttribute(THINNED);
  const sorted = labels.sort(order);
  for (let step = 1; step <= sorted.length; step++) {
    const shown = sorted.filter((_, index) => index % step === 0);
    if (!crowded(shown, horizontal) || shown.length <= 1) {
      sorted.forEach((label, index) => {
        if (index % step !== 0) label.setAttribute(THINNED, '');
      });
      return;
    }
  }
}

/** Keep every plot axis under `root` readable as it renders and resizes. */
export function observeTicks(root: Element): () => void {
  let frame = 0;
  let stopped = false;
  const thinAll = () => {
    frame = 0;
    for (const axis of root.querySelectorAll(AXES)) thinAxis(axis);
  };
  const schedule = () => {
    if (!frame && !stopped) frame = requestAnimationFrame(thinAll);
  };
  const observer = new MutationObserver(schedule);
  // Not THINNED itself, or each pass would schedule the next.
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['transform', 'x', 'y'],
  });
  const view = root.ownerDocument.defaultView;
  view?.addEventListener('resize', schedule);
  void root.ownerDocument.fonts?.ready.then(schedule);
  schedule();
  return () => {
    stopped = true;
    view?.removeEventListener('resize', schedule);
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
  };
}
