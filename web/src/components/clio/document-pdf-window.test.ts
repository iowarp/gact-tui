import { describe, expect, it } from 'vitest';
import {
  estimatedPdfPageHeight,
  fitPdfPageWidth,
  pdfPageNumbers,
  pdfPageWindow,
} from './document-pdf-window';

describe('pdfPageWindow', () => {
  it('renders a bounded window of a long document instead of every page', () => {
    const window = pdfPageWindow({
      pageCount: 400,
      pageHeightPx: 800,
      scrollTop: 0,
      viewportHeight: 1_000,
    });

    expect(pdfPageNumbers(window)).toEqual([1, 2, 3, 4]);
    expect(window.leadingSpacerPx).toBe(0);
    expect(window.trailingSpacerPx).toBe(396 * 800);
  });

  it('follows the scroll position through the document', () => {
    const window = pdfPageWindow({
      pageCount: 400,
      pageHeightPx: 800,
      scrollTop: 80_000,
      viewportHeight: 1_000,
    });

    expect(pdfPageNumbers(window)).toEqual([99, 100, 101, 102, 103, 104]);
    expect(window.leadingSpacerPx).toBe(98 * 800);
    expect(window.trailingSpacerPx).toBe(296 * 800);
  });

  it('clamps the window to the last page at the end of the document', () => {
    const window = pdfPageWindow({
      pageCount: 12,
      pageHeightPx: 800,
      scrollTop: 1_000_000,
      viewportHeight: 1_000,
    });

    expect(window.last).toBe(12);
    expect(pdfPageNumbers(window)).toEqual([10, 11, 12]);
    expect(window.trailingSpacerPx).toBe(0);
  });

  it('renders a bounded first window while the viewport is still unmeasured', () => {
    expect(
      pdfPageNumbers(
        pdfPageWindow({ pageCount: 400, pageHeightPx: 800, scrollTop: 0, viewportHeight: 0 }),
      ),
    ).toEqual([1, 2, 3]);
    expect(
      pdfPageNumbers(
        pdfPageWindow({ pageCount: 400, pageHeightPx: 0, scrollTop: 0, viewportHeight: 1_000 }),
      ),
    ).toEqual([1, 2, 3]);
  });

  it('renders nothing before the page count is known', () => {
    const window = pdfPageWindow({
      pageCount: 0,
      pageHeightPx: 800,
      scrollTop: 0,
      viewportHeight: 1_000,
    });

    expect(window).toEqual({ first: 0, last: 0, leadingSpacerPx: 0, trailingSpacerPx: 0 });
    expect(pdfPageNumbers(window)).toEqual([]);
  });

  it('honours an explicit overscan', () => {
    expect(
      pdfPageNumbers(
        pdfPageWindow({
          overscan: 0,
          pageCount: 400,
          pageHeightPx: 800,
          scrollTop: 80_000,
          viewportHeight: 1_000,
        }),
      ),
    ).toEqual([101, 102]);
  });
});

describe('estimatedPdfPageHeight', () => {
  it('estimates a page box from its rendered width until a real page is measured', () => {
    expect(estimatedPdfPageHeight(0)).toBeGreaterThan(0);
    expect(estimatedPdfPageHeight(600)).toBeGreaterThan(600);
    expect(estimatedPdfPageHeight(1_200)).toBeGreaterThan(estimatedPdfPageHeight(600));
  });
});

describe('fitPdfPageWidth', () => {
  it('fits a complete page inside the available reading height at 100% zoom', () => {
    const width = fitPdfPageWidth({ hostWidth: 1_000, viewportHeight: 800 });

    expect(width).toBeLessThan(1_000);
    expect(estimatedPdfPageHeight(width)).toBeLessThanOrEqual(800);
  });

  it('keeps a narrower page at its available width', () => {
    expect(fitPdfPageWidth({ hostWidth: 400, viewportHeight: 800 })).toBe(400);
  });
});
