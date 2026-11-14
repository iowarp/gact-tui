import { afterEach, describe, expect, it, vi } from 'vitest';
import { clonedNode, snapshotClientView } from './file-view-snapshot';

const { embedFonts, renderCanvas } = vi.hoisted(() => ({
  embedFonts: vi.fn(async () => ''),
  renderCanvas: vi.fn(),
}));
vi.mock('html-to-image', () => ({ getFontEmbedCSS: embedFonts, toCanvas: renderCanvas }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

/** A 3D view as the CAD view lays it out: the WebGL canvas, a measurement label over it,
 * the size caption, and a comment mark that is not part of the view. */
function cadView() {
  const root = document.createElement('div');
  root.innerHTML = `
    <canvas data-slot="webgl"></canvas>
    <div data-slot="cad-measure-labels"><div>3.00 mm</div></div>
    <p data-slot="cad-size">82.0 × 24.0 × 20.0 mm</p>
    <div data-capture-ui="true"><span>S1</span></div>`;
  document.body.append(root);
  const scene = root.querySelector('canvas')!;
  scene.width = 900;
  scene.height = 600;
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 900, 600));
  vi.spyOn(scene, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 900, 600));
  return { root, scene };
}

/** The image canvas the snapshot creates, with a recording 2D context. */
function recordingCanvas() {
  const drawn: { source: unknown; at: number[] }[] = [];
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const element = create(tag);
    if (tag !== 'canvas') return element;
    const context = {
      fillStyle: '',
      fillRect: () => undefined,
      drawImage: (source: unknown, ...at: number[]) => drawn.push({ source, at }),
    };
    // getContext has WebGPU overloads as well; the snapshot uses only 2D.
    vi.spyOn(element as HTMLCanvasElement, 'getContext').mockImplementation(
      (() => context as unknown as CanvasRenderingContext2D) as never,
    );
    vi.spyOn(element as HTMLCanvasElement, 'toDataURL').mockReturnValue('data:image/png;base64,AA');
    return element;
  }) as typeof document.createElement);
  return drawn;
}

describe('client-rendered file view snapshot', () => {
  it('draws the live canvas, then the HTML over it, measurement labels included', async () => {
    const { root, scene } = cadView();
    const overlay = { overlay: true };
    renderCanvas.mockResolvedValue(overlay);
    const drawn = recordingCanvas();
    const draw = vi.fn(() => scene);

    const snapshot = await snapshotClientView(root, draw, { scale: 2, maxSide: 4096 });

    expect(draw).toHaveBeenCalledTimes(1);
    expect(drawn.map((row) => row.source)).toEqual([scene, overlay]);
    expect(drawn[0]!.at).toEqual([0, 0, 1800, 1200]);
    expect(snapshot).toMatchObject({
      image: 'data:image/png;base64,AA',
      width: 900,
      height: 600,
      scale: 2,
      painted: { canvas: 1, html: 1 },
      skipped: [],
    });
    const options = renderCanvas.mock.calls[0]![1] as {
      filter: (node: Node) => boolean;
      style: Record<string, string>;
    };
    expect(options.style.backgroundColor).toBe('transparent');
    const label = root.querySelector('[data-slot="cad-measure-labels"] div')!;
    expect(options.filter(label)).toBe(true);
    expect(label.textContent).toBe('3.00 mm');
    expect(options.filter(root.querySelector('[data-slot="cad-size"]')!)).toBe(true);
    expect(options.filter(scene)).toBe(false);
    expect(options.filter(root.querySelector('[data-capture-ui]')!)).toBe(false);
    root.remove();
  });

  it('names the HTML it could not draw instead of leaving it out silently', async () => {
    const { root, scene } = cadView();
    renderCanvas.mockRejectedValue(new Error('clone failed'));
    recordingCanvas();
    const snapshot = await snapshotClientView(root, () => scene, { scale: 1 });
    expect(snapshot).toMatchObject({
      painted: { canvas: 1, html: 0 },
      skipped: [{ what: 'html', reason: 'html_overlay_not_drawn' }],
    });
    root.remove();
  });

  it('refuses a view with no size on screen, typed', async () => {
    const root = document.createElement('div');
    expect(await snapshotClientView(root, undefined)).toEqual({
      error: { reason: 'view_not_laid_out', message: 'The view has no size on screen.' },
    });
  });

  it('keeps text and leaves out canvases and comment tools in the clone', () => {
    expect(clonedNode(document.createTextNode('3.00 mm'))).toBe(true);
    expect(clonedNode(document.createElement('canvas'))).toBe(false);
  });
});
