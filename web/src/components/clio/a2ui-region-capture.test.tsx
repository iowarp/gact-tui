import { describe, expect, it, vi } from 'vitest';
import { captureRenderedSurfacePng } from './a2ui-region-capture';

const { embedFonts, renderCanvas } = vi.hoisted(() => ({
  embedFonts: vi.fn(),
  renderCanvas: vi.fn(),
}));

vi.mock('html-to-image', () => ({ getFontEmbedCSS: embedFonts, toCanvas: renderCanvas }));

describe('rendered surface PNG', () => {
  it('retains fonts and suppresses export-only table scrollbars without changing the live view', async () => {
    const target = document.createElement('div');
    target.innerHTML =
      '<div data-slot="data-grid"><div role="region" style="overflow:auto"><div data-slot="clio-data-grid-viewport" style="overflow:auto">Last row</div></div></div>';
    const original = target.innerHTML;
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 200));
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 200;
    // getContext has WebGPU overloads as well; this capture uses only 2D.
    vi.spyOn(canvas, 'getContext').mockImplementation(
      (() => ({}) as CanvasRenderingContext2D) as unknown as typeof canvas.getContext,
    );
    vi.spyOn(canvas, 'toBlob').mockImplementation((callback) =>
      callback(new Blob(['pixels'], { type: 'image/png' })),
    );
    embedFonts.mockResolvedValue(
      '@font-face { font-family: Report; src: url(data:font/woff2;base64,AA); }',
    );
    renderCanvas.mockResolvedValue(canvas);

    const result = await captureRenderedSurfacePng(target, 1);

    expect(result.type).toBe('image/png');
    expect(embedFonts).toHaveBeenCalledWith(target);
    const options = renderCanvas.mock.calls[0]?.[1];
    expect(options.fontEmbedCSS).toContain('@font-face');
    expect(options.fontEmbedCSS).toContain('[data-slot="data-grid"] [role="region"]');
    expect(options.fontEmbedCSS).toContain(
      '[data-slot="clio-data-grid-viewport"] { overflow: hidden !important; }',
    );
    expect(target.innerHTML).toBe(original);
  });
});
