import { describe, expect, it, vi } from 'vitest';
import { chartJpegBlob, chartPngBlob, chartSvgText } from './chart-export';

/**
 * G0: chart download is produced by the renderer through the Vega `View`
 * itself (`toImageURL`/`toSVG`/`toCanvas`), never Vega-embed's own `actions`
 * menu (suppressed — see `chart-embed.ts`'s security contract) and never
 * agent code. A fake `View` stands in for the real one; `a2ui-chart.test.tsx`
 * covers the end-to-end wiring (the toolbar's download menu calling these).
 */

function fakePngDataUrl(): string {
  // A 1x1 transparent PNG, valid enough for `fetch(...).blob()` in jsdom.
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
}

describe('chartPngBlob', () => {
  it('fetches the data URL from view.toImageURL("png") and returns it as a Blob', async () => {
    const view = { toImageURL: vi.fn().mockResolvedValue(fakePngDataUrl()) };
    const blob = await chartPngBlob(view as never);
    expect(view.toImageURL).toHaveBeenCalledWith('png');
    // Not `toBeInstanceOf(Blob)`: jsdom's fetch polyfill and the test realm
    // can disagree on which global `Blob` constructor produced this value.
    expect(blob.constructor.name).toBe('Blob');
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe('chartSvgText', () => {
  it('returns the view\'s own SVG markup verbatim', async () => {
    const view = { toSVG: vi.fn().mockResolvedValue('<svg><rect/></svg>') };
    await expect(chartSvgText(view as never)).resolves.toBe('<svg><rect/></svg>');
  });
});

describe('chartJpegBlob', () => {
  it('composites the view canvas onto an opaque background and returns a JPEG Blob', async () => {
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 4;
    sourceCanvas.height = 4;
    const view = { toCanvas: vi.fn().mockResolvedValue(sourceCanvas) };

    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function toBlob(this: HTMLCanvasElement, callback) {
        callback(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }));
      });
    const fillRectSpy = vi.fn();
    const drawImageSpy = vi.fn();
    const fakeContext = { drawImage: drawImageSpy, fillRect: fillRectSpy, fillStyle: '' };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      // `getContext` is overloaded per contextId (2d/webgl/webgpu/...); a
      // single mock implementation is cast to its whole type (through
      // `unknown`, since the fake context deliberately implements only the
      // two methods this module calls) rather than fought through each
      // overload.
      (() => fakeContext) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );

    const blob = await chartJpegBlob(view as never);

    expect(fillRectSpy).toHaveBeenCalled(); // an opaque background was painted first
    expect(drawImageSpy).toHaveBeenCalledWith(sourceCanvas, 0, 0);
    expect(blob.type).toBe('image/jpeg');
    toBlobSpy.mockRestore();
  });

  it('rejects with a clear error when no 2D context is available', async () => {
    const view = { toCanvas: vi.fn().mockResolvedValue(document.createElement('canvas')) };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    await expect(chartJpegBlob(view as never)).rejects.toThrow(/canvas 2D context/u);
  });
});
