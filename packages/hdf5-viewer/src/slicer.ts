/**
 * A horizontal slice slider for each of h5web's slicing sliders.
 *
 * h5web's dimension mapper draws each sliced dimension as a vertical slider,
 * which takes a tall column above a stacked plot (viewer.css). The stacked
 * mapper shows this native range input instead, on the same row as the axis
 * pickers. h5web keeps owning the slice: its slider stays mounted, hidden,
 * and this drives it the way its own keyboard handling does, so the debounced
 * slice change, its state and its accessibility values are unchanged.
 */

const LABEL = '[id^="h5w-slider-"][id$="-label"]';
const THUMB = '[role="slider"]';
const INPUT_CLASS = 'viewer-slice';
const PAGE = 10;

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function valueOf(thumb: Element): number {
  return Number(thumb.getAttribute('aria-valuenow') ?? 0);
}

function key(doc: Document, name: string, type: 'keydown' | 'keyup' = 'keydown') {
  doc.dispatchEvent(new KeyboardEvent(type, { key: name, bubbles: true, cancelable: true }));
}

/**
 * Step h5web's slider to the latest requested value. react-slider starts a
 * keyboard move on its thumb's focus and then listens on the document; its
 * own `focus()` call is silenced so the reader's focus stays on the input.
 */
async function drive(thumb: HTMLElement, target: () => number) {
  const doc = thumb.ownerDocument;
  thumb.focus = () => {};
  thumb.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  await nextTask();
  try {
    for (let guard = 0; guard < 2000 && thumb.isConnected; guard += 1) {
      const diff = target() - valueOf(thumb);
      if (diff === 0) break;
      const big = Math.abs(diff) >= PAGE;
      key(doc, diff > 0 ? (big ? 'PageUp' : 'ArrowUp') : big ? 'PageDown' : 'ArrowDown');
      await nextTask();
    }
  } finally {
    key(doc, 'ArrowUp', 'keyup');
    doc.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    delete (thumb as { focus?: unknown }).focus;
  }
}

function attach(container: HTMLElement, label: HTMLElement): (() => void) | undefined {
  const thumb = container.querySelector<HTMLElement>(THUMB);
  if (!thumb) return undefined;
  const max = Number(thumb.getAttribute('aria-valuemax') ?? 0);
  const input = container.ownerDocument.createElement('input');
  input.type = 'range';
  input.className = INPUT_CLASS;
  input.min = thumb.getAttribute('aria-valuemin') ?? '0';
  input.max = String(max);
  input.step = '1';
  input.value = String(valueOf(thumb));
  input.setAttribute('aria-labelledby', label.id);
  input.title = `${label.textContent ?? ''} slice, 0 to ${max}`;
  const readout = container.ownerDocument.createElement('output');
  readout.className = 'viewer-slice-value';
  readout.value = input.value;
  container.append(input, readout);

  let target = valueOf(thumb);
  let running: Promise<void> | undefined;
  const onInput = () => {
    target = Number(input.value);
    readout.value = input.value;
    running ??= drive(thumb, () => target).finally(() => {
      running = undefined;
    });
  };
  input.addEventListener('input', onInput);
  const sync = new MutationObserver(() => {
    const top = thumb.getAttribute('aria-valuemax') ?? '0';
    input.max = top;
    input.title = `${label.textContent ?? ''} slice, 0 to ${top}`;
    if (running) return;
    target = valueOf(thumb);
    input.value = String(target);
    readout.value = input.value;
  });
  sync.observe(thumb, { attributes: true, attributeFilter: ['aria-valuenow', 'aria-valuemax'] });
  return () => {
    input.removeEventListener('input', onInput);
    sync.disconnect();
    input.remove();
    readout.remove();
  };
}

/** Adds a horizontal slider beside each of h5web's slicing sliders, as they appear. */
export function observeSlicers(root: Element) {
  const attached = new Map<HTMLElement, () => void>();
  const scan = () => {
    for (const [container, detach] of attached) {
      if (!container.isConnected || !container.querySelector(THUMB)) {
        detach();
        attached.delete(container);
      }
    }
    for (const label of root.querySelectorAll<HTMLElement>(LABEL)) {
      const container = label.parentElement;
      if (!container || attached.has(container)) continue;
      const detach = attach(container, label);
      if (detach) attached.set(container, detach);
    }
  };
  const observer = new MutationObserver(scan);
  observer.observe(root, { childList: true, subtree: true });
  scan();
  return () => {
    observer.disconnect();
    for (const detach of attached.values()) detach();
    attached.clear();
  };
}
