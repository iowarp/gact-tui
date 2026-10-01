import { describe, expect, it, vi } from 'vitest';
import { mapPngBlob } from './map-export';

/**
 * G0: map download is produced by the renderer reading the maplibre canvas's
 * own `toBlob` directly (no server round trip, no agent code) — see the
 * module doc comment on why it reads the canvas inside a `map.once('render',
 * ...)` callback after `map.triggerRepaint()`, rather than setting
 * `preserveDrawingBuffer: true` on the `<Map>` (#516 review item 14).
 * `a2ui-map-data-source.test.tsx` covers the end-to-end wiring (the toolbar's
 * download menu calling this against a captured map instance).
 */

function fakeMap(canvas: HTMLCanvasElement) {
  let renderListener: (() => void) | undefined;
  return {
    getCanvas: vi.fn().mockReturnValue(canvas),
    once: vi.fn((type: 'render', listener: () => void) => {
      expect(type).toBe('render');
      renderListener = listener;
    }),
    triggerRepaint: vi.fn(() => {
      // Simulates the browser firing the render callback once the forced
      // repaint actually happens.
      renderListener?.();
    }),
  };
}

describe('mapPngBlob', () => {
  it('reads the canvas inside a render callback, only after forcing a repaint', async () => {
    const canvas = document.createElement('canvas');
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function toBlob(this: HTMLCanvasElement, callback) {
        callback(new Blob(['png-bytes'], { type: 'image/png' }));
      });
    const map = fakeMap(canvas);

    const blob = await mapPngBlob(map);

    expect(map.once).toHaveBeenCalledWith('render', expect.any(Function));
    expect(map.triggerRepaint).toHaveBeenCalledTimes(1);
    expect(toBlobSpy).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(blob.type).toBe('image/png');
    toBlobSpy.mockRestore();
  });

  it('never reads the canvas before the render callback fires', async () => {
    const canvas = document.createElement('canvas');
    const toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob');
    let renderListener: (() => void) | undefined;
    const map = {
      getCanvas: vi.fn().mockReturnValue(canvas),
      once: vi.fn((_type: 'render', listener: () => void) => {
        renderListener = listener;
      }),
      triggerRepaint: vi.fn(),
    };

    void mapPngBlob(map);
    expect(toBlobSpy).not.toHaveBeenCalled();

    toBlobSpy.mockImplementation(function toBlob(this: HTMLCanvasElement, callback) {
      callback(new Blob(['png-bytes'], { type: 'image/png' }));
    });
    renderListener?.();
    expect(toBlobSpy).toHaveBeenCalled();
    toBlobSpy.mockRestore();
  });

  it('rejects with a clear error when the canvas produces no blob', async () => {
    const canvas = document.createElement('canvas');
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function toBlob(this: HTMLCanvasElement, callback) {
        callback(null);
      });
    const map = fakeMap(canvas);

    await expect(mapPngBlob(map)).rejects.toThrow(/PNG export failed/u);
    toBlobSpy.mockRestore();
  });
});
