/**
 * h5web asks each axis for at least three ticks, and d3 rounds that up to a
 * "nice" step: a 4096-wide axis in a phone-width plot gets five "1e+3"-style
 * labels in about 120px, written over each other. Where an axis's labels
 * would touch, keep every second one (then every third, …), always from the
 * first, so the ones shown stay evenly spaced. Tick marks keep their place.
 */

const AXES = '.visx-axis-bottom, .visx-axis-top, .visx-axis-left, .visx-axis-right';
/** Read by viewer.css, which hides the label. */
export const THINNED = 'data-viewer-tick-thinned';
/** The least space between two labels, in CSS pixels. */
const GAP = 4;

function crowded(labels: readonly Element[], horizontal: boolean): boolean {
  let previous: DOMRect | undefined;
  for (const label of labels) {
    const rect = label.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    if (previous) {
      const gap = horizontal ? rect.left - previous.right : rect.top - previous.bottom;
      if (gap < GAP) return true;
    }
    previous = rect;
  }
  return false;
}

/** Show the most labels of one axis that don't touch. */
export function thinAxis(axis: Element): void {
  const horizontal = /visx-axis-(bottom|top)/u.test(axis.getAttribute('class') ?? '');
  const labels = [...axis.querySelectorAll('.visx-axis-tick text')];
  const order = (a: Element, b: Element) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return horizontal ? ra.left - rb.left : ra.top - rb.top;
  };
  for (const label of labels) label.removeAttribute(THINNED);
  const sorted = labels.sort(order);
  for (let step = 1; step < sorted.length; step++) {
    const shown = sorted.filter((_, index) => index % step === 0);
    if (!crowded(shown, horizontal) || shown.length <= 2) {
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
  const thinAll = () => {
    frame = 0;
    for (const axis of root.querySelectorAll(AXES)) thinAxis(axis);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(thinAll);
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
  schedule();
  return () => {
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
  };
}
