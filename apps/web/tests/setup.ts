import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount between tests so focus assertions never read a previous render's DOM.
afterEach(() => cleanup());

// jsdom implements no PointerEvent at all (`new PointerEvent(...)` throws
// ReferenceError), so `fireEvent.pointerDown/Move/Up` silently degrade to a
// bare Event with clientX/clientY undefined — real pointer-drag components
// (kit/Splitter, kit/Layer's resize grip) are then untestable. PointerEvent
// is a MouseEvent per spec; this is the minimal real shape those handlers
// read (clientX/Y via MouseEvent, plus pointerId/pointerType).
if (!('PointerEvent' in globalThis)) {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? 'mouse';
    }
  }
  Object.defineProperty(globalThis, 'PointerEvent', {
    value: PointerEventPolyfill,
    writable: true,
  });
}

// jsdom also has no pointer-capture API on Element — every drag handler that
// calls (release)?setPointerCapture would throw outside a per-test mock.
for (const method of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'] as const) {
  if (!(method in Element.prototype)) {
    Object.defineProperty(Element.prototype, method, {
      value: method === 'hasPointerCapture' ? () => false : () => {},
      writable: true,
    });
  }
}

// --- graph/gantt rendering support (viz rebuild 2026-08) -------------------
// React Flow (the provenance DAG) and the gantt's ResizeObserver-driven plot
// measurement both read browser APIs jsdom does not implement. React Flow's own
// testing guidance prescribes exactly this mock set. NOTE what these do NOT
// buy: real geometry. Layout in both surfaces is computed from the data (dagre
// over character widths; a pure lane model), never from measurement — so the
// unit tests assert the MODEL, and the pixel results are verified in the
// browser screenshot pass instead.
// The observer must actually FIRE, not just exist: React Flow only records a
// node's handle bounds when its resize callback runs, and an edge with no
// handle bounds is silently dropped — a mock that no-ops would render a graph
// with nodes and no edges, which is exactly the kind of quiet degradation the
// tests are there to catch.
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverMock {
    private readonly callback: ResizeObserverCallback;
    private readonly targets = new Set<Element>();
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      this.targets.add(target);
      this.callback(
        [
          {
            target,
            contentRect: target.getBoundingClientRect(),
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
    unobserve(target: Element) {
      this.targets.delete(target);
    }
    disconnect() {
      this.targets.clear();
    }
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverMock,
    writable: true,
  });
}

if (!('DOMMatrixReadOnly' in globalThis)) {
  class DOMMatrixReadOnlyMock {
    readonly m22: number;
    constructor(transform?: string) {
      const scale = transform?.match(/scale\(([0-9.]+)\)/)?.[1];
      this.m22 = scale === undefined ? 1 : Number(scale);
    }
  }
  Object.defineProperty(globalThis, 'DOMMatrixReadOnly', {
    value: DOMMatrixReadOnlyMock,
    writable: true,
  });
}

if (typeof SVGElement !== 'undefined' && !('getBBox' in SVGElement.prototype)) {
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    value: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    writable: true,
  });
}

// React Flow measures each node through offsetWidth/offsetHeight, which jsdom
// hardcodes to 0. The nodes carry their own laid-out size, so reporting a real
// non-zero box keeps the library from treating every node as unmeasured.
for (const [property, value] of [
  ['offsetWidth', 200],
  ['offsetHeight', 26],
] as const) {
  const existing = Object.getOwnPropertyDescriptor(HTMLElement.prototype, property);
  if (!existing?.get || existing.configurable) {
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get(this: HTMLElement) {
        const inline = this.style?.[property === 'offsetWidth' ? 'width' : 'height'];
        const parsed = inline ? Number.parseFloat(inline) : Number.NaN;
        return Number.isFinite(parsed) ? parsed : value;
      },
    });
  }
}
