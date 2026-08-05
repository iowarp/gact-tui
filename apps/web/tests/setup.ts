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
