import { describe, expect, it } from 'vitest';
import { GRAPH_GAP, GRAPH_MARGIN, GRAPH_MIN_ZOOM, fitColumns, fitHeight } from './graph-fit';

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
});
