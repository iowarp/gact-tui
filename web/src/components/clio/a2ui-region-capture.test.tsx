import { describe, expect, it, vi } from 'vitest';
import { captureRenderedSurfacePng } from './a2ui-region-capture';

const { embedFonts, renderCanvas, mapFrame } = vi.hoisted(() => ({
  embedFonts: vi.fn(),
  renderCanvas: vi.fn(),
  mapFrame: vi.fn(),
}));

vi.mock('html-to-image', () => ({ getFontEmbedCSS: embedFonts, toCanvas: renderCanvas }));
vi.mock('./map-export', () => ({ mapPngBlob: mapFrame }));

function drawableCanvas(): { canvas: HTMLCanvasElement; drawn: unknown[] } {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 200;
  const drawn: unknown[] = [];
  const context = {
    drawImage: (source: unknown) => drawn.push(source),
    strokeRect: () => {},
    fillRect: () => {},
    fillText: () => {},
    measureText: () => ({ width: 10 }),
  };
  // getContext has WebGPU overloads as well; this capture uses only 2D.
  vi.spyOn(canvas, 'getContext').mockImplementation(
    (() => context as unknown as CanvasRenderingContext2D) as unknown as typeof canvas.getContext,
  );
  vi.spyOn(canvas, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['pixels'], { type: 'image/png' })),
  );
  return { canvas, drawn };
}

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
    // Blob-backed artifact images cannot be fetched with an appended query.
    expect(options.cacheBust).toBe(false);
    expect(options.includeQueryParams).toBe(true);
    expect(options.fetchRequestInit).toEqual({ cache: 'no-store' });
    expect(options.fontEmbedCSS).toContain('@font-face');
    expect(options.fontEmbedCSS).toContain('[data-slot="data-grid"] [role="region"]');
    expect(options.fontEmbedCSS).toContain(
      '[data-slot="clio-data-grid-viewport"] { overflow: hidden !important; }',
    );
    expect(target.innerHTML).toBe(original);
    // Toolbars stay in the copy's layout, hidden, so nothing below them moves.
    expect(options.fontEmbedCSS).toContain('[data-slot="surface-toolbar"]');
    expect(options.fontEmbedCSS).toContain('visibility: hidden !important');
    const toolbar = document.createElement('div');
    toolbar.setAttribute('data-slot', 'surface-toolbar');
    expect(options.filter(toolbar)).toBe(true);
    expect(options.filter(document.createElement('canvas'))).toBe(false);
  });

  it('leaves nodes that paint nothing out of the copy, keeping a select its options', async () => {
    // Live: a profile stack's search suggestions, a datalist of 1064 options, made the
    // copy hold the page's main thread for seven seconds, so no view could renew its
    // capture lease and every capture on the page failed.
    const target = document.createElement('div');
    target.innerHTML = `<datalist>${'<option value="profile"></option>'.repeat(1064)}</datalist>
      <select><option>temperature</option></select><p style="display:none">Hidden tab</p>
      <template><p>Unrendered</p></template><p>Shown</p>`;
    document.body.append(target);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 200));
    const { canvas } = drawableCanvas();
    embedFonts.mockResolvedValue('');
    renderCanvas.mockClear().mockResolvedValue(canvas);
    await captureRenderedSurfacePng(target, 1);
    const { filter } = renderCanvas.mock.calls[0]![1];
    const [datalist, select, hidden, template, shown] = target.children;
    expect([datalist, hidden, template].map(filter)).toEqual([false, false, false]);
    expect([select, select!.firstElementChild, shown].map(filter)).toEqual([true, true, true]);
    target.remove();
  });

  it('refuses a view whose map is still loading instead of capturing its placeholder', async () => {
    const target = document.createElement('div');
    target.innerHTML = '<div aria-busy="true" aria-label="Loading Sites map"></div>';
    renderCanvas.mockClear();

    await expect(captureRenderedSurfacePng(target, 1)).rejects.toThrow(
      'Part of this view is still loading',
    );
    expect(renderCanvas).not.toHaveBeenCalled();
  });

  it('draws the live map frame when the capture target is the map surface itself', async () => {
    const surface = document.createElement('div');
    surface.setAttribute('data-slot', 'a2ui-map-surface');
    const mapCanvas = document.createElement('canvas');
    mapCanvas.className = 'maplibregl-canvas';
    surface.append(mapCanvas);
    const map = { getCanvas: () => mapCanvas };
    (surface as HTMLElement & { __clioMap?: unknown }).__clioMap = map;
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 200));
    vi.spyOn(mapCanvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 200));
    const { canvas, drawn } = drawableCanvas();
    const overlay = document.createElement('canvas');
    renderCanvas.mockReset();
    renderCanvas.mockResolvedValueOnce(canvas).mockResolvedValueOnce(overlay);
    embedFonts.mockResolvedValue('');
    const frame = { close: vi.fn() };
    mapFrame.mockReset();
    mapFrame.mockResolvedValue(new Blob(['frame'], { type: 'image/png' }));
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(frame));

    await captureRenderedSurfacePng(surface, 1);

    expect(mapFrame).toHaveBeenCalledWith(map);
    // The frame first, then the DOM overlay above it; never the live WebGL canvas itself.
    expect(drawn).toEqual([frame, overlay]);
    vi.unstubAllGlobals();
  });

  it('takes the capture again when the layout changed while it was painted', async () => {
    const target = document.createElement('div');
    const chart = document.createElement('canvas');
    chart.width = 10;
    chart.height = 10;
    target.append(chart);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 200));
    // The chart grows by its legend during the first capture, then holds.
    const heights = [100, 140, 140, 140, 140, 140, 140, 140];
    vi.spyOn(chart, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, 20, 300, heights.length > 1 ? heights.shift()! : heights[0]!),
    );
    renderCanvas.mockReset();
    renderCanvas.mockImplementation(async () => drawableCanvas().canvas);

    const result = await captureRenderedSurfacePng(target, 1);

    expect(result.type).toBe('image/png');
    expect(renderCanvas).toHaveBeenCalledTimes(2);
  });

  it('fails with the reason when the layout never holds', async () => {
    const target = document.createElement('div');
    const chart = document.createElement('canvas');
    chart.width = 10;
    chart.height = 10;
    target.append(chart);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 200));
    let height = 100;
    vi.spyOn(chart, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, 20, 300, (height += 7)),
    );
    renderCanvas.mockReset();
    renderCanvas.mockImplementation(async () => drawableCanvas().canvas);

    await expect(captureRenderedSurfacePng(target, 1)).rejects.toThrow('kept changing its layout');
  });
});
