import { afterEach, describe, expect, it, vi } from 'vitest';
import { svgIntrinsicSize, svgToPngBlob } from './mermaid-export';

/**
 * G0: a mermaid/workflow diagram's download is produced client-side from its
 * own rendered SVG, never a server round trip (there is no artifact table
 * behind a diagram to export through). `svgToPngBlob` is pure — it takes the
 * SVG markup and a pixel size rather than reading a live DOM node — so a tiny
 * inline SVG string exercises it fully, mirroring `chart-export.test.ts`'s
 * canvas-mocking pattern for the Vega-view equivalent.
 */

const SAMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect/></svg>';

describe('svgIntrinsicSize', () => {
  it('reads width/height from the SVG root\'s viewBox', () => {
    expect(svgIntrinsicSize(SAMPLE_SVG)).toEqual({ width: 100, height: 50 });
  });

  it('is undefined for an SVG with no viewBox, or a malformed one', () => {
    expect(svgIntrinsicSize('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')).toBeUndefined();
    expect(svgIntrinsicSize('<svg viewBox="0 0 -10 50"></svg>')).toBeUndefined();
    expect(svgIntrinsicSize('<svg viewBox="not numbers"></svg>')).toBeUndefined();
  });
});

describe('svgToPngBlob', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rasterizes the SVG onto an opaque white background and returns a PNG Blob', async () => {
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function toBlob(this: HTMLCanvasElement, callback) {
        callback(new Blob(['png-bytes'], { type: 'image/png' }));
      });
    const fillRectSpy = vi.fn();
    const drawImageSpy = vi.fn();
    const fakeContext = { drawImage: drawImageSpy, fillRect: fillRectSpy, fillStyle: '' };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => fakeContext) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );

    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image);

    const blob = await svgToPngBlob(SAMPLE_SVG, 100, 50);

    expect(fillRectSpy).toHaveBeenCalled(); // an opaque background was painted first
    expect(drawImageSpy).toHaveBeenCalledWith(expect.any(FakeImage), 0, 0, 200, 100); // scaled 2x
    expect(blob.type).toBe('image/png');
    toBlobSpy.mockRestore();
  });

  it('rejects with a clear error when the browser has no 2D canvas context', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    await expect(svgToPngBlob(SAMPLE_SVG, 100, 50)).rejects.toThrow(/canvas 2D context/u);
  });

  it('rejects with a clear error when the SVG image fails to load', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => ({ drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: '' })) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', FailingImage as unknown as typeof Image);

    await expect(svgToPngBlob(SAMPLE_SVG, 100, 50)).rejects.toThrow(/could not be loaded/u);
  });
});
