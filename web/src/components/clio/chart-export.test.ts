import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chartJpegBlob, chartPngBlob, chartSvgText } from './chart-export';

/**
 * G0: chart download is produced by the renderer through the Vega `View`
 * itself (`toImageURL`/`toSVG`/`toCanvas`), never Vega-embed's own `actions`
 * menu (suppressed — see `chart-embed.ts`'s security contract) and never
 * agent code. A fake `View` stands in for the real one; `a2ui-chart.test.tsx`
 * covers the end-to-end wiring (the toolbar's download menu calling these).
 *
 * `chart-embed.ts` always embeds with a transparent background, so these
 * tests pin the #516 review item 13 fix: every export temporarily sets the
 * view's background to the component's own card color (never left
 * transparent, never hardcoded white) and restores it afterward, and passes
 * the device's own pixel ratio as the render scale factor.
 */

function fakePngDataUrl(): string {
  // A 1x1 transparent PNG, valid enough for `fetch(...).blob()` in jsdom.
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
}

const ORIGINAL_DPR = window.devicePixelRatio;

afterEach(() => {
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: ORIGINAL_DPR });
  vi.restoreAllMocks();
});

describe('chartPngBlob', () => {
  it('sets the view background to the given card color, renders at the device pixel ratio, and restores it', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    const background = vi.fn().mockReturnValue('rgb(10, 10, 10)');
    const view = {
      background,
      toImageURL: vi.fn().mockResolvedValue(fakePngDataUrl()),
    };

    const blob = await chartPngBlob(view as never, '#111827');

    expect(background).toHaveBeenCalledWith('#111827');
    // Restored to whatever it read as the ORIGINAL value, after exporting.
    expect(background).toHaveBeenLastCalledWith('rgb(10, 10, 10)');
    expect(view.toImageURL).toHaveBeenCalledWith('png', 2);
    expect(blob.constructor.name).toBe('Blob');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('restores the original background even when the export itself throws', async () => {
    const background = vi.fn().mockReturnValue('transparent');
    const view = {
      background,
      toImageURL: vi.fn().mockRejectedValue(new Error('boom')),
    };

    await expect(chartPngBlob(view as never, '#ffffff')).rejects.toThrow('boom');
    expect(background).toHaveBeenCalledWith('#ffffff');
    expect(background).toHaveBeenLastCalledWith('transparent');
  });
});

describe('chartSvgText', () => {
  it("returns the view's own SVG markup verbatim", async () => {
    const view = { toSVG: vi.fn().mockResolvedValue('<svg><rect/></svg>') };
    await expect(chartSvgText(view as never)).resolves.toBe('<svg><rect/></svg>');
  });
});

describe('chartJpegBlob', () => {
  let toBlobSpy: ReturnType<typeof vi.spyOn>;
  let fillRectSpy: ReturnType<typeof vi.fn>;
  let drawImageSpy: ReturnType<typeof vi.fn>;
  let fillStyleSets: string[];

  beforeEach(() => {
    fillRectSpy = vi.fn();
    drawImageSpy = vi.fn();
    fillStyleSets = [];
    const fakeContext = {
      drawImage: drawImageSpy,
      fillRect: fillRectSpy,
      set fillStyle(value: string) {
        fillStyleSets.push(value);
      },
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      // `getContext` is overloaded per contextId (2d/webgl/webgpu/...); a
      // single mock implementation is cast to its whole type (through
      // `unknown`, since the fake context deliberately implements only the
      // methods this module calls) rather than fought through each overload.
      (() => fakeContext) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );
  });

  it('sets the view background, renders at the device pixel ratio, and composites onto that same card color (never a hardcoded white)', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = 4;
    sourceCanvas.height = 4;
    const background = vi.fn().mockReturnValue('transparent');
    const view = { background, toCanvas: vi.fn().mockResolvedValue(sourceCanvas) };
    toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function toBlob(this: HTMLCanvasElement, callback) {
        callback(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }));
      });

    const blob = await chartJpegBlob(view as never, '#1f2937');

    expect(background).toHaveBeenCalledWith('#1f2937');
    expect(view.toCanvas).toHaveBeenCalledWith(3);
    expect(fillStyleSets).toContain('#1f2937'); // never '#ffffff'
    expect(fillRectSpy).toHaveBeenCalled();
    expect(drawImageSpy).toHaveBeenCalledWith(sourceCanvas, 0, 0);
    expect(blob.type).toBe('image/jpeg');
    toBlobSpy.mockRestore();
  });

  it('rejects with a clear error when no 2D context is available', async () => {
    const view = {
      background: vi.fn().mockReturnValue('transparent'),
      toCanvas: vi.fn().mockResolvedValue(document.createElement('canvas')),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    await expect(chartJpegBlob(view as never, '#ffffff')).rejects.toThrow(/canvas 2D context/u);
  });
});
