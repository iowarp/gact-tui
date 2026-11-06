import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as platform from '@/lib/platform';
import { ZoomPan, zoomScrollHint } from './zoom-pan';

afterEach(cleanup);

it('keeps capture geometry stable when a parent replaces an interaction callback', async () => {
  const images: Array<{ onload?: () => void }> = [];
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 600;
      naturalHeight = 200;
      onload?: () => void;
      constructor() {
        images.push(this);
      }
    },
  );
  const context = {
    clearRect: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    drawImage: vi.fn(),
    restore: vi.fn(),
  };
  const width = vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
  const height = vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const props = { imageSrc: 'diagram.svg', selectableTextSvg: '<svg><text>Stage</text></svg>' };
  try {
    const view = render(<ZoomPan {...props} onRegionClick={vi.fn()} />);
    await act(async () => images[0]!.onload?.());
    await flushZoomFrame();
    const layer = view.container.querySelector('[data-slot="diagram-text-selection"]')!;
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(layer, { attributes: true, childList: true, subtree: true });
    view.rerender(<ZoomPan {...props} onRegionClick={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect([...mutations, ...observer.takeRecords()]).toHaveLength(0);
    // A real geometry change must still be visible to the capture observer.
    fireEvent.keyDown(screen.getByRole('img'), { key: '+' });
    await flushZoomFrame();
    expect(context.drawImage).toHaveBeenCalled();
    expect(mutations.length + observer.takeRecords().length).toBeGreaterThan(0);
    observer.disconnect();
  } finally {
    width.mockRestore();
    height.mockRestore();
    getContext.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('refits a replacement image even when its aspect ratio does not resize the viewport', async () => {
  const images: Array<{ naturalWidth: number; naturalHeight: number; onload?: () => void }> = [];
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 1600;
      naturalHeight = 800;
      onload?: () => void;
      constructor() {
        images.push(this);
      }
    },
  );
  const width = vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  const height = vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  try {
    const view = render(
      <ZoomPan
        imageSrc="first.png"
        viewportMode="image-aspect"
        controls={(api) => <span data-testid="scale-percent">{api.scalePercent}</span>}
      />,
    );
    await act(async () => images[0].onload?.());
    expect(currentPercent()).toBe(45);
    view.rerender(
      <ZoomPan
        imageSrc="second.png"
        viewportMode="image-aspect"
        controls={(api) => <span data-testid="scale-percent">{api.scalePercent}</span>}
      />,
    );
    images[1].naturalWidth = 3200;
    images[1].naturalHeight = 1600;
    await act(async () => images[1].onload?.());
    expect(currentPercent()).toBe(23);
  } finally {
    width.mockRestore();
    height.mockRestore();
    context.mockRestore();
    vi.unstubAllGlobals();
  }
});

/** Lets the zoom RAF loop (`updateImmediate`) flush before the next assertion. */
async function flushZoomFrame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });
}

function renderZoomPan() {
  render(
    <ZoomPan
      ariaLabel="Diagram canvas"
      controls={(api) => <span data-testid="scale-percent">{api.scalePercent}</span>}
    />,
  );
  return screen.getByRole('img', { name: 'Diagram canvas' });
}

function currentPercent() {
  return Number(screen.getByTestId('scale-percent').textContent);
}

/**
 * #1549 G9 #27: the non-passive `wheel` listener used to call
 * `preventDefault()` and zoom on every wheel event, so hovering the diagram
 * while scrolling the page (a synthetic wheel event in the QA repro, but the
 * same listener fires for a real trackpad scroll too) captured the page's
 * scroll instead of letting it through. Only Ctrl/Meta+wheel -- which is
 * also how browsers report pinch-to-zoom -- should zoom; a plain wheel event
 * must be left alone so the page scrolls normally.
 */
describe('ZoomPan wheel scoping', () => {
  it('does not change the transform or capture a plain wheel event', async () => {
    const canvas = renderZoomPan();
    const before = currentPercent();

    let notCancelled = true;
    await act(async () => {
      notCancelled = fireEvent.wheel(canvas, { deltaY: -120 });
    });
    await flushZoomFrame();

    expect(notCancelled).toBe(true); // preventDefault was never called -- the page scrolls
    expect(currentPercent()).toBe(before);
  });

  it('zooms and captures the event on ctrl+wheel', async () => {
    const canvas = renderZoomPan();
    const before = currentPercent();

    let notCancelled = true;
    await act(async () => {
      notCancelled = fireEvent.wheel(canvas, { ctrlKey: true, deltaY: -120 });
    });
    await flushZoomFrame();

    expect(notCancelled).toBe(false); // preventDefault called -- the page does not also scroll
    expect(currentPercent()).toBeGreaterThan(before);
  });

  it('zooms on meta+wheel too (macOS trackpad pinch)', async () => {
    const canvas = renderZoomPan();
    const before = currentPercent();

    await act(async () => {
      fireEvent.wheel(canvas, { deltaY: -120, metaKey: true });
    });
    await flushZoomFrame();

    expect(currentPercent()).toBeGreaterThan(before);
  });
});

describe('ZoomPan touch', () => {
  it('pans on touchmove without a passive-listener preventDefault', async () => {
    const canvas = renderZoomPan();
    // `touch-action: none` is what stops the browser panning the page here.
    expect(canvas).toHaveClass('touch-none');
    const preventDefault = vi.spyOn(Event.prototype, 'preventDefault');
    try {
      await act(async () => {
        fireEvent.touchStart(canvas, { touches: [{ clientX: 10, clientY: 10 }] });
        fireEvent.touchMove(canvas, { touches: [{ clientX: 40, clientY: 30 }] });
        fireEvent.touchEnd(canvas, { changedTouches: [{ clientX: 40, clientY: 30 }] });
      });
      expect(preventDefault).not.toHaveBeenCalled();
    } finally {
      preventDefault.mockRestore();
    }
  });
});

/**
 * #1549 G9 follow-up (adversarial review of #514): the toolbar hint said
 * "Scroll to zoom, drag to pan" even after the wheel listener above started
 * requiring Ctrl/Meta -- stale copy that no longer named a real affordance.
 * `zoomScrollHint` is the one shared string every host (`mermaid-preview.tsx`
 * and `resource-viewers.tsx`'s image viewer, both built on this component)
 * renders instead, so the modifier can't drift out of sync again.
 */
describe('zoomScrollHint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names Ctrl+scroll on a non-Mac host', () => {
    vi.spyOn(platform, 'isMacOS').mockReturnValue(false);

    expect(zoomScrollHint()).toBe('Ctrl+scroll or pinch to zoom, drag to pan');
  });

  it('names the Mac glyph on a macOS host', () => {
    vi.spyOn(platform, 'isMacOS').mockReturnValue(true);

    expect(zoomScrollHint()).toBe('⌘+scroll or pinch to zoom, drag to pan');
  });
});
