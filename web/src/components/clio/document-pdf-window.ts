/**
 * Which pages of a PDF the continuous-scroll viewer keeps mounted.
 *
 * A mounted `react-pdf` page is a rendered canvas plus a text and an annotation
 * layer. Mounting every page of a long document is a document-sized bitmap held
 * in the tab, so the viewer mounts only the pages the viewport can reach and
 * stands two spacers in for the rest — the scroll extent stays exactly that of
 * the whole document, so the scrollbar and every scroll position keep meaning
 * what they meant when all pages were mounted.
 *
 * The geometry lives here, apart from the component, so the window a given
 * scroll position produces can be asserted directly.
 */

import {
  PDF_PAGE_ESTIMATED_ASPECT_RATIO,
  PDF_PAGE_GAP_PX,
  PDF_PAGE_OVERSCAN,
} from '@/lib/runtime-limits';

export interface PdfPageWindow {
  /** First page kept mounted, 1-based. `0` when no page is mounted. */
  first: number;
  /** Last page kept mounted, inclusive and 1-based. `0` when none is. */
  last: number;
  /** Height standing in for the pages above `first`. Unit: pixels. */
  leadingSpacerPx: number;
  /** Height standing in for the pages below `last`. Unit: pixels. */
  trailingSpacerPx: number;
}

export interface PdfPageWindowInput {
  /** Pages the loaded document reports. `0` before it has loaded. */
  pageCount: number;
  /**
   * Height of one page box including the gap below it. Unit: pixels.
   * Measured from a rendered page where one exists, and estimated from the
   * render width by {@link estimatedPdfPageHeight} until then.
   */
  pageHeightPx: number;
  /** Scroll offset of the viewer's scroll container. Unit: pixels. */
  scrollTop: number;
  /** Visible height of that container. Unit: pixels. `0` when unmeasured. */
  viewportHeight: number;
  /** Pages kept on each side of the visible range. Defaults to the tunable. */
  overscan?: number;
}

/**
 * Resolves the mounted page window for one scroll position.
 *
 * Before layout has run — a first paint, a hidden tab, a test environment with
 * no layout — the viewport height and the page height are both unknown. Rather
 * than mount everything or nothing, the window falls back to the overscan-sized
 * band at the current position, so the reader sees the top of the document and
 * the real window takes over on the first measurement.
 */
export function pdfPageWindow({
  overscan = PDF_PAGE_OVERSCAN,
  pageCount,
  pageHeightPx,
  scrollTop,
  viewportHeight,
}: PdfPageWindowInput): PdfPageWindow {
  const bounds = Math.max(0, Math.trunc(overscan));
  if (pageCount <= 0) return { first: 0, last: 0, leadingSpacerPx: 0, trailingSpacerPx: 0 };
  const measured = Number.isFinite(pageHeightPx) && pageHeightPx > 0;
  const pageHeight = measured ? pageHeightPx : 0;
  const offset = measured ? Math.max(0, scrollTop) : 0;
  const height = measured ? Math.max(0, viewportHeight) : 0;
  const lastIndex = pageCount - 1;
  const firstVisible = measured ? Math.min(Math.floor(offset / pageHeight), lastIndex) : 0;
  const lastVisible = measured
    ? Math.min(Math.floor((offset + height) / pageHeight), lastIndex)
    : 0;
  const start = Math.max(0, firstVisible - bounds);
  const end = Math.min(lastIndex, lastVisible + bounds);
  return {
    first: start + 1,
    last: end + 1,
    leadingSpacerPx: start * pageHeight,
    trailingSpacerPx: (lastIndex - end) * pageHeight,
  };
}

/** Expands a window into the 1-based page numbers to mount. */
export function pdfPageNumbers({ first, last }: PdfPageWindow): number[] {
  if (first < 1 || last < first) return [];
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

/**
 * Height to reserve for a page rendered at `widthPx`, before any page of this
 * document has been measured. Includes the gap below the page.
 */
export function estimatedPdfPageHeight(widthPx: number): number {
  const width = Number.isFinite(widthPx) && widthPx > 0 ? widthPx : 1;
  return width * PDF_PAGE_ESTIMATED_ASPECT_RATIO + PDF_PAGE_GAP_PX;
}

/**
 * Width that keeps a complete portrait page inside a bounded reading viewport.
 * The returned width is the 100% baseline; viewer zoom is applied afterwards.
 */
export function fitPdfPageWidth({
  hostWidth,
  viewportHeight,
}: {
  hostWidth: number;
  viewportHeight: number;
}): number {
  const availableWidth = Number.isFinite(hostWidth) && hostWidth > 0 ? hostWidth : 1;
  if (!Number.isFinite(viewportHeight) || viewportHeight <= PDF_PAGE_GAP_PX) {
    return availableWidth;
  }
  const heightBound =
    (viewportHeight - PDF_PAGE_GAP_PX) / PDF_PAGE_ESTIMATED_ASPECT_RATIO;
  return Math.min(availableWidth, heightBound);
}
