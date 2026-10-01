import { describe, expect, it, vi } from 'vitest';
import { mapPngBlob } from './map-export';

/**
 * G0: map download is produced by the renderer reading the maplibre canvas's
 * own `toBlob` directly (no server round trip, no agent code) — see the
 * module doc comment on why `preserveDrawingBuffer` matters for this to work
 * reliably. `a2ui-map-data-source.test.tsx` covers the end-to-end wiring (the
 * toolbar's download menu calling this against a captured map instance).
 */

describe('mapPngBlob', () => {
  it('resolves with the Blob produced by canvas.toBlob', async () => {
    const canvas = document.createElement('canvas');
    // `toBlob` has a single (non-overloaded) signature, unlike `getContext` in
    // `chart-export.test.ts`'s own canvas mocking — no cast needed for
    // `mockImplementation` to contextually type `callback` here.
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function toBlob(this: HTMLCanvasElement, callback) {
        callback(new Blob(['png-bytes'], { type: 'image/png' }));
      });

    const blob = await mapPngBlob(canvas);

    expect(toBlobSpy).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(blob.type).toBe('image/png');
    toBlobSpy.mockRestore();
  });

  it('rejects with a clear error when the canvas produces no blob', async () => {
    const canvas = document.createElement('canvas');
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function toBlob(this: HTMLCanvasElement, callback) {
        callback(null);
      });

    await expect(mapPngBlob(canvas)).rejects.toThrow(/PNG export failed/u);
    toBlobSpy.mockRestore();
  });
});
