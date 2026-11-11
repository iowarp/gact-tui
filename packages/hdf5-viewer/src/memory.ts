import { paneFitsExplorer, readView } from './modes';
import type { Hdf5DimSlot, Hdf5Mode, Hdf5ViewMemory } from './protocol';
import { drive } from './slicer';

/**
 * Keeps the reader's place across a page reload.
 *
 * h5web holds the dimension mapping (which dimensions are axes, and the slice
 * of each other one) in component state that a reload drops, and takes no
 * prop for it. This reads it from the mapper's own controls, by their
 * accessible names, for the host to keep; after a reload it clicks the same
 * axis buttons and steps the same sliders back, through h5web's own handling.
 */

const AXIS_GROUP = (axis: 'x' | 'y') =>
  `[role="radiogroup"][aria-label="Dimension as ${axis} axis"]`;
const SLICE_LABEL = (dimension: number) => `#h5w-slider-${dimension}-label`;
const THUMB = '[role="slider"]';
/** Longest wait for the restored object's visualization to render. */
const RESTORE_TIMEOUT = 8000;
/** Quiet time before a change is reported, so a slider drag reports once. */
const REPORT_DELAY = 150;

function axisRadios(root: ParentNode, axis: 'x' | 'y'): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(`${AXIS_GROUP(axis)} [role="radio"]`)];
}

function sliceThumb(root: ParentNode, dimension: number): HTMLElement | null | undefined {
  const label = root.querySelector(SLICE_LABEL(dimension));
  if (!label) return undefined;
  return label.parentElement?.querySelector<HTMLElement>(THUMB) ?? null;
}

/** The mapping h5web's mapper shows, or undefined when no mapper is shown. */
export function readMapping(root: ParentNode): Hdf5DimSlot[] | undefined {
  const xs = axisRadios(root, 'x');
  if (!xs.length) return undefined;
  const ys = axisRadios(root, 'y');
  return xs.map((radio, dimension): Hdf5DimSlot => {
    if (radio.getAttribute('aria-checked') === 'true') return 'x';
    if (ys[dimension]?.getAttribute('aria-checked') === 'true') return 'y';
    const thumb = sliceThumb(root, dimension);
    // A one-element dimension has a label but no slider.
    if (thumb === null) return 0;
    if (thumb === undefined) return null;
    return Number(thumb.getAttribute('aria-valuenow') ?? 0);
  });
}

export function readMemory(root: Element, locator: string): Hdf5ViewMemory {
  const view = readView(root);
  return {
    locator,
    mode: view.mode,
    explorer: view.explorer,
    wide: paneFitsExplorer(root),
    mapping: readMapping(root),
  };
}

/** Report the reader's view as it changes, once it settles. */
export function observeMemory(
  root: Element,
  locator: () => string,
  onChange: (memory: Hdf5ViewMemory) => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastKey = '';
  let paused = false;
  const report = () => {
    timer = undefined;
    if (paused) return;
    const memory = readMemory(root, locator());
    const key = JSON.stringify(memory);
    if (key === lastKey) return;
    lastKey = key;
    onChange(memory);
  };
  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(report, REPORT_DELAY);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-valuenow', 'aria-checked', 'aria-selected', 'data-explorer'],
  });
  return {
    /** Hold reports while a restore steps through intermediate states. */
    pause(value: boolean) {
      paused = value;
      if (!value) schedule();
    },
    dispose() {
      observer.disconnect();
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 16));
}

/** Resolves once `ready` holds, re-checking on each change under `root`; false on timeout or cancel. */
function until(root: Element, ready: () => boolean, cancelled: () => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    if (ready()) {
      resolve(true);
      return;
    }
    const finish = (value: boolean) => {
      observer.disconnect();
      clearTimeout(timeout);
      resolve(value);
    };
    const observer = new MutationObserver(() => {
      if (cancelled()) finish(false);
      else if (ready()) finish(true);
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true });
    const timeout = setTimeout(() => finish(ready()), RESTORE_TIMEOUT);
  });
}

function sameShape(current: Hdf5DimSlot[] | undefined, wanted: Hdf5DimSlot[]): boolean {
  return (
    current?.length === wanted.length &&
    current.every((slot, index) => (slot === null) === (wanted[index] === null))
  );
}

/**
 * Return to `memory`'s mode, axes and slices once its object shows. `show`
 * selects a mode the way the host's frame does. Returns a cancel function.
 */
export function restoreMemory(
  root: Element,
  memory: Hdf5ViewMemory,
  show: (mode: Hdf5Mode) => void,
  done: () => void,
): () => void {
  let cancelled = false;
  const isCancelled = () => cancelled;
  void (async () => {
    try {
      const { mode, mapping } = memory;
      if (mode) {
        show(mode);
        if (!(await until(root, () => readView(root).mode === mode, isCancelled))) return;
      }
      if (!mapping || mode === 'attributes') return;
      if (!(await until(root, () => sameShape(readMapping(root), mapping), isCancelled))) return;
      // Axes first: moving an axis turns the dimension it leaves into a slice at 0.
      for (let attempt = 0; attempt < 4 && !cancelled; attempt += 1) {
        const current = readMapping(root);
        if (!current) return;
        let moved = false;
        for (const axis of ['x', 'y'] as const) {
          const wanted = mapping.indexOf(axis);
          if (wanted < 0 || current.indexOf(axis) === wanted) continue;
          axisRadios(root, axis)[wanted]?.click();
          moved = true;
          await nextFrame();
        }
        if (!moved) break;
      }
      for (const [dimension, slot] of mapping.entries()) {
        if (cancelled) return;
        if (typeof slot !== 'number' || slot === 0) continue;
        const thumb = sliceThumb(root, dimension);
        const max = Number(thumb?.getAttribute('aria-valuemax') ?? 0);
        if (thumb) await drive(thumb, () => Math.min(slot, max));
      }
    } finally {
      if (!cancelled) done();
    }
  })();
  return () => {
    cancelled = true;
  };
}
