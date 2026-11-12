import { describe, expect, it } from 'vitest';
import {
  GRAPH_GAP,
  GRAPH_MARGIN,
  GRAPH_MIN_ZOOM,
  fitColumns,
  fitHeight,
  fitWidth,
  focusViewport,
  graphEdges,
} from './graph-fit';

const CARD = 120;
const span = (columns: number, gap: number) => columns * CARD + (columns - 1) * gap;

describe('graph fit', () => {
  it('keeps the spec size when the columns fit', () => {
    expect(fitColumns(600, 3, CARD)).toEqual({ gap: GRAPH_GAP.max, zoom: 1 });
  });

  it('opens fitted while the fit stays readable', () => {
    const fit = fitColumns(400, 3, CARD);
    expect(fit.zoom).toBeGreaterThanOrEqual(GRAPH_MIN_ZOOM);
    expect(span(3, fit.gap) * fit.zoom).toBeLessThanOrEqual(400 - 2 * GRAPH_MARGIN + 0.01);
  });

  it('stops at the readable floor and leaves the rest a pan away', () => {
    const fit = fitColumns(368, 6, CARD);
    expect(fit).toEqual({ gap: GRAPH_GAP.min, zoom: GRAPH_MIN_ZOOM });
    expect(span(6, fit.gap) * fit.zoom).toBeGreaterThan(368 - 2 * GRAPH_MARGIN);
  });

  it('also fits a tall drawing to the pane height, never below the readable floor', () => {
    const fit = { gap: GRAPH_GAP.max, zoom: 1 };
    expect(fitHeight(fit, 474, 500)).toBeCloseTo(0.9);
    expect(fitHeight(fit, 300, 1200)).toBe(GRAPH_MIN_ZOOM);
    expect(fitHeight(fit, 800, 200)).toBe(1);
    expect(fitHeight(fit, undefined, 200)).toBe(1);
  });

  it('fits a drawing to the pane width while it stays readable, and scrolls past that', () => {
    expect(fitWidth(1000, 500, 14)).toBe(1);
    expect(fitWidth(390, 400, 14)).toBeCloseTo(362 / 400);
    expect(fitWidth(390, 640, 14)).toBe(GRAPH_MIN_ZOOM);
    expect(fitWidth(undefined, 640, 14)).toBe(1);
  });

  it('opens a wide drawing on its focus, clamped to the drawing’s edges', () => {
    const pane = { w: 400, h: 300 };
    // Fits: anchored top-left like the other graphs.
    expect(
      focusViewport({ pane, width: 300, height: 200, focus: { x: 250, y: 50 }, zoom: 1 }),
    ).toEqual({ x: GRAPH_MARGIN, y: GRAPH_MARGIN, zoom: 1 });
    // Wider than the pane: the focus is centred across, still top-anchored down.
    expect(
      focusViewport({ pane, width: 1600, height: 200, focus: { x: 800, y: 50 }, zoom: 1 }),
    ).toEqual({ x: -600, y: GRAPH_MARGIN, zoom: 1 });
    // A focus at the far end stops at the drawing's last column, not past it.
    expect(
      focusViewport({ pane, width: 1600, height: 200, focus: { x: 1590, y: 50 }, zoom: 1 }).x,
    ).toBe(400 - GRAPH_MARGIN - 1600);
    expect(
      focusViewport({ pane, width: 1600, height: 200, focus: { x: 10, y: 50 }, zoom: 1 }).x,
    ).toBe(GRAPH_MARGIN);
  });

  it('cues each pane edge the drawing continues past, level with its visible middle', () => {
    const pane = { paneWidth: 360, paneHeight: 600 };
    expect(graphEdges({ ...pane, x: 14, y: 14, width: 300, height: 180 })).toEqual({
      left: false,
      right: false,
      top: false,
      bottom: false,
      level: 104,
      across: 164,
    });
    const scrolled = graphEdges({ ...pane, x: -40, y: 14, width: 520, height: 180 });
    expect(scrolled).toMatchObject({ left: true, right: true, top: false, bottom: false });
    expect(scrolled?.level).toBe(104);
    expect(graphEdges({ ...pane, x: 0, y: 0, width: 0, height: 0 })).toBeUndefined();
  });
});
