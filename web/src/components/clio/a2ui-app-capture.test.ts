// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAppFrame, paintAppFrames } from './a2ui-app-capture';
import { registerViewSnapshot } from './mcp-app-look';

function box(element: Element, left: number, top: number, width: number, height: number) {
  element.getBoundingClientRect = () =>
    ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;
}

function fakeContext() {
  return {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D & Record<string, ReturnType<typeof vi.fn>>;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('paintAppFrames', () => {
  it('paints a view from its snapshot at its frame box, and names why another is missing', async () => {
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        decode() {
          return Promise.resolve();
        }
      },
    );
    const target = document.createElement('div');
    target.innerHTML =
      '<iframe data-mcp-app-iframe="a"></iframe><iframe data-mcp-app-iframe="b"></iframe>' +
      '<iframe data-mcp-app-iframe="c"></iframe><iframe title="other"></iframe>';
    document.body.append(target);
    const [a, b, c, other] = [...target.querySelectorAll('iframe')] as HTMLIFrameElement[];
    box(target, 100, 50, 800, 600);
    box(a!, 120, 60, 400, 300);
    box(b!, 120, 380, 400, 200);
    box(c!, 540, 60, 300, 300);
    box(other!, 540, 380, 300, 200);
    const snapshot = vi.fn().mockResolvedValue({
      image: 'data:image/png;base64,iVBORw0KGgo=',
      width: 400,
      height: 300,
      scale: 2,
      painted: { canvas: 1 },
      skipped: [
        { what: 'canvas', reason: 'webgl_canvas_idle' },
        { what: 'frame', reason: 'frame_cross_origin' },
      ],
    });
    registerViewSnapshot(a!, snapshot);
    registerViewSnapshot(c!, () =>
      Promise.resolve({ error: { reason: 'view_not_readable', message: 'another origin' } }),
    );
    const context = fakeContext();

    await paintAppFrames(context, target, 2, 2);

    expect(snapshot).toHaveBeenCalledWith({ scale: 2, maxSide: 4096 });
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    expect(context.drawImage.mock.calls[0]!.slice(1)).toEqual([40, 20, 800, 600]);
    const texts = context.fillText.mock.calls.map((call) => call[0] as string);
    expect(texts).toEqual([
      'Not in this picture: frame_cross_origin',
      'View not captured: the view has not finished loading (view_not_ready).',
      'View not captured: another origin (view_not_readable).',
    ]);
    expect(isAppFrame(a!)).toBe(true);
    expect(isAppFrame(other!)).toBe(false);
  });
});
