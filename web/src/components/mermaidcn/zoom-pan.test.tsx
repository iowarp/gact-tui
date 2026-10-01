import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ZoomPan } from './zoom-pan';

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
