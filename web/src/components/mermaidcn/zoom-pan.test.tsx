import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as platform from '@/lib/platform';
import { ZoomPan, zoomScrollHint } from './zoom-pan';

afterEach(cleanup);

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
  it("does not change the transform or capture a plain wheel event", async () => {
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
