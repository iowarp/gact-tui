import { MarkerType } from '@xyflow/react';
import { useEffect, useState, type RefObject } from 'react';

/** Space between the pane edge and the drawing, as in the spec's graph canvases. */
export const GRAPH_MARGIN = 12;
/** The column gap shrinks from the spec's 56px down to this before the drawing scales. */
export const GRAPH_GAP = { min: 24, max: 56 } as const;
/** Below this scale a card's name is unreadable: the rest of the drawing is a pan away. */
export const GRAPH_MIN_ZOOM = 0.85;

/** The spec's link: a 1.3px faint line ending in a 7px arrowhead. */
export const GRAPH_EDGE_STYLE = { stroke: 'var(--faint)', strokeWidth: 1.3 };
export const GRAPH_ARROW = {
  type: MarkerType.ArrowClosed,
  color: 'var(--faint)',
  width: 7,
  height: 7,
} as const;

export interface PaneSize {
  w: number;
  h: number;
}

export interface ColumnFit {
  /** Gap between columns, in graph units. */
  gap: number;
  /** The canvas scale: 1 when the columns fit, never below the floor (`GRAPH_MIN_ZOOM`). */
  zoom: number;
}

/**
 * Fit `columns` cards of `width` to a pane: the gap shrinks first, then the whole
 * drawing scales down to `floor`; past that the reader pans.
 */
export function fitColumns(
  paneWidth: number | undefined,
  columns: number,
  width: number,
  floor: number = GRAPH_MIN_ZOOM,
): ColumnFit {
  // Not measured yet (or no layout at all): the spec's size until the pane reports.
  if (!paneWidth) return { gap: GRAPH_GAP.max, zoom: 1 };
  const room = paneWidth - 2 * GRAPH_MARGIN;
  if (columns <= 1) return { gap: GRAPH_GAP.max, zoom: Math.max(floor, Math.min(1, room / width)) };
  const gap = Math.min(
    GRAPH_GAP.max,
    Math.max(GRAPH_GAP.min, (room - columns * width) / (columns - 1)),
  );
  const span = columns * width + (columns - 1) * gap;
  return { gap, zoom: Math.max(floor, Math.min(1, room / span)) };
}

/** The scale that also fits a drawing `drawingHeight` tall to the pane, never below `floor`. */
export function fitHeight(
  fit: ColumnFit,
  paneHeight: number | undefined,
  drawingHeight: number,
  floor: number = GRAPH_MIN_ZOOM,
): number {
  if (!paneHeight || drawingHeight <= 0) return fit.zoom;
  const room = paneHeight - 2 * GRAPH_MARGIN;
  return Math.max(floor, Math.min(fit.zoom, room / drawingHeight));
}

/** The drawing anchored at the pane's top-left, as the spec lays graphs out. */
export function topLeftViewport(zoom: number) {
  return { x: GRAPH_MARGIN, y: GRAPH_MARGIN, zoom };
}

/** A pane's size, measured once per frame while it resizes. */
export function usePaneSize(container: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<PaneSize>();
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const w = element.clientWidth;
        const h = element.clientHeight;
        if (w && h) setSize((prev) => (prev?.w === w && prev.h === h ? prev : { w, h }));
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [container]);
  return size;
}
