import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioDocumentPdfViewer } from './document-pdf-viewer';
import { ViewerToolbarHost } from './viewer-toolbar-context';
import { selectionCommenter } from '@/lib/selection-actions-file';

const documentPageCount = vi.hoisted(() => ({ value: 3 }));
const pageRenderReady = vi.hoisted(() => ({ value: true }));
const pageAspectRatio = vi.hoisted(() => ({ value: 11 / 8.5 }));
const commentSession = vi.hoisted(() => ({
  current: undefined as
    | {
        open: boolean;
        active: boolean;
        mode: string;
        start: ReturnType<typeof vi.fn>;
        addMark: ReturnType<typeof vi.fn>;
      }
    | undefined,
}));

vi.mock('./comments/comment-session', () => ({
  useCommentSession: () => commentSession.current,
}));

vi.mock('react-pdf', async () => {
  const React = await import('react');
  return {
    pdfjs: { GlobalWorkerOptions: {} },
    Document: ({
      children,
      onLoadSuccess,
    }: {
      children: React.ReactNode;
      onLoadSuccess: (value: { numPages: number }) => void;
    }) => {
      React.useEffect(() => onLoadSuccess({ numPages: documentPageCount.value }), [onLoadSuccess]);
      return <div>{children}</div>;
    },
    Page: ({
      onLoadSuccess,
      onRenderSuccess,
      pageNumber,
      width,
      scale,
    }: {
      onLoadSuccess?: (page: { getViewport: () => { width: number; height: number } }) => void;
      onRenderSuccess?: () => void;
      pageNumber: number;
      width: number;
      scale: number;
    }) => {
      React.useEffect(() => {
        onLoadSuccess?.({
          getViewport: () => ({ width: 100, height: 100 * pageAspectRatio.value }),
        });
        // A loaded page keeps its identity while its canvas resizes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [pageNumber]);
      // Match react-pdf's geometry changes, without rerunning merely because
      // the parent's inline render callback has a fresh reference.
      React.useEffect(() => {
        if (pageRenderReady.value) onRenderSuccess?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [pageNumber, width, scale]);
      return (
        <div data-test-pdf-width={width} data-test-pdf-scale={scale}>
          PDF page {pageNumber}
        </div>
      );
    },
  };
});

/**
 * JSDOM lays nothing out, so every element reads as hidden (no client rects, no
 * size) and the viewer ignores its scroll position, as it does under a
 * background tab. A test that scrolls gives the viewer a box on screen.
 */
function laidOut() {
  return vi
    .spyOn(Element.prototype, 'getClientRects')
    .mockImplementation(() => [new DOMRect(0, 0, 320, 700)] as unknown as DOMRectList);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.querySelector('[data-test-toolbar]')?.remove();
  documentPageCount.value = 3;
  pageRenderReady.value = true;
  pageAspectRatio.value = 11 / 8.5;
  commentSession.current = undefined;
  window.getSelection()?.removeAllRanges();
});

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height } as DOMRect;
}

describe('ClioDocumentPdfViewer', () => {
  it("the selection menu's Comment marks the selected text as quads on its page", async () => {
    const session = { open: true, active: false, mode: 'text', start: vi.fn(), addMark: vi.fn() };
    commentSession.current = session;
    render(<ClioDocumentPdfViewer bytes={new Uint8Array([37, 80, 68, 70])} name="paper.pdf" />);
    const text = await screen.findByText('PDF page 1');
    const page = text.closest<HTMLElement>('[data-page]')!;
    vi.spyOn(page, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 200, 400));
    const range = document.createRange();
    range.selectNodeContents(text);
    range.getClientRects = () => [rect(20, 40, 100, 20)] as unknown as DOMRectList;
    window.getSelection()!.addRange(range);

    expect(selectionCommenter({ container: text })?.(window.getSelection())).toBe(true);
    expect(session.addMark).toHaveBeenCalledWith(
      {
        profile: 'pdf-quad',
        exact: 'PDF page 1',
        page_index: 0,
        quads: [[0.1, 0.1, 0.6, 0.1, 0.6, 0.15, 0.1, 0.15]],
      },
      { box: { left: 20, top: 40, width: 100, height: 20 } },
    );
  });

  it.each([9 / 16, 11 / 8.5, 2])(
    'fits a page of actual aspect ratio %s by default',
    async (ratio) => {
      pageAspectRatio.value = ratio;
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1_200);
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
      render(<ClioDocumentPdfViewer bytes={new Uint8Array([37, 80, 68, 70])} name="paper.pdf" />);
      const page = await screen.findByText('PDF page 1');
      const width = Number(page.dataset.testPdfWidth);
      expect(width).toBeGreaterThan(0);
      expect(width + 26).toBeLessThanOrEqual(1_200);
      expect(width * ratio + 26).toBeLessThanOrEqual(600);
    },
  );

  it('zooms an explicit width view out in steps to a complete page, where zooming out stops', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1_200);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    render(
      <ClioDocumentPdfViewer
        bytes={new Uint8Array([37, 80, 68, 70])}
        fit="width"
        name="paper.pdf"
      />,
    );
    const page = await screen.findByText('PDF page 1');
    const fitted = Number(page.dataset.testPdfWidth);
    expect(fitted * pageAspectRatio.value).toBeGreaterThan(600);
    // Two zoom icons only: zooming out from the fitted width steps down to page fit.
    expect(screen.queryByRole('button', { name: /reset|fit/iu })).toBeNull();
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    await userEvent.click(zoomOut);
    // One step is 15% of the width the reader saw, not a jump to the whole page.
    expect(Number(page.dataset.testPdfScale)).toBeCloseTo(0.85);
    expect(zoomOut).toBeEnabled();
    for (let step = 0; step < 20 && !(zoomOut as HTMLButtonElement).disabled; step += 1)
      await userEvent.click(zoomOut);
    const scale = Number(page.dataset.testPdfScale);
    expect(fitted * scale * pageAspectRatio.value + 26).toBeLessThanOrEqual(600.5);
    expect(zoomOut).toBeDisabled();
  });

  it('captures modifier-wheel zoom inside the PDF and leaves ordinary scrolling alone', async () => {
    render(<ClioDocumentPdfViewer bytes={new Uint8Array([37, 80, 68, 70])} name="paper.pdf" />);
    await screen.findByText('PDF page 1');
    const scroller = document.querySelector<HTMLElement>('[data-pdf-scroller]')!;
    const scale = () => Number(screen.getByText('PDF page 1').dataset.testPdfScale);
    const appWheel = vi.fn();
    window.addEventListener('wheel', appWheel);
    try {
      expect(fireEvent.wheel(scroller, { metaKey: true, deltaY: -120, cancelable: true })).toBe(
        false,
      );
      expect(scale()).toBeCloseTo(1.15);
      expect(appWheel).not.toHaveBeenCalled();
      expect(fireEvent.wheel(scroller, { ctrlKey: true, deltaY: 120, cancelable: true })).toBe(
        false,
      );
      expect(scale()).toBeCloseTo(1);
      // Page fit is where zooming out stops.
      expect(fireEvent.wheel(scroller, { ctrlKey: true, deltaY: 120, cancelable: true })).toBe(
        false,
      );
      expect(scale()).toBeCloseTo(1);
      expect(appWheel).not.toHaveBeenCalled();
      expect(fireEvent.wheel(scroller, { deltaY: 120, cancelable: true })).toBe(true);
      expect(appWheel).toHaveBeenCalledTimes(1);
      expect(scale()).toBeCloseTo(1);
    } finally {
      window.removeEventListener('wheel', appWheel);
    }
  });

  it('keeps continuous pages and shares zoom with the host toolbar', async () => {
    const user = userEvent.setup();
    const toolbar = document.createElement('div');
    toolbar.setAttribute('data-test-toolbar', '');
    document.body.append(toolbar);
    render(
      <ViewerToolbarHost.Provider value={toolbar}>
        <ClioDocumentPdfViewer bytes={new Uint8Array([37, 80, 68, 70])} name="paper.pdf" />
      </ViewerToolbarHost.Provider>,
    );

    expect(await screen.findByText('PDF page 1')).toBeVisible();
    expect(screen.getByText('PDF page 2')).toBeVisible();
    expect(screen.getByText('PDF page 3')).toBeVisible();

    expect(screen.queryByRole('button', { name: 'Use paged PDF view' })).not.toBeInTheDocument();
    expect(toolbar).toContainElement(screen.getByRole('button', { name: 'Zoom in' }));
    // Outside a frame the page counter leads the zoom icons; there is no footer.
    expect(toolbar).toContainElement(screen.getByText('Page 1 of 3'));
    expect(screen.getByText('1 / 3')).toBeVisible();
    expect(document.querySelector('footer')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('115%')).toBeVisible();
    expect(screen.getByText('PDF page 2')).toBeVisible();
    toolbar.remove();
  });

  it('jumps continuous-scroll to the requested initial page once a real page height is known', async () => {
    documentPageCount.value = 400;
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getBoundingClientRect(this: HTMLElement) {
        const page = this instanceof HTMLElement && this.hasAttribute('data-page');
        return {
          bottom: page ? 300 : 700,
          height: page ? 300 : 700,
          left: 0,
          right: 320,
          top: 0,
          width: 320,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      });

    laidOut();
    render(
      <ClioDocumentPdfViewer
        bytes={new Uint8Array([37, 80, 68, 70])}
        initialPage={200}
        name="thesis.pdf"
      />,
    );

    // Page 1 renders first (scroll starts at 0) so its real height can be
    // measured; the jump to page 200 follows once that measurement lands.
    const scroller = document.querySelector<HTMLElement>('[data-pdf-scroller]');
    await waitFor(() => expect(scroller?.scrollTop).toBeGreaterThan(0));
    // The jump lands on page 200: it paints at once, not after a fling settles.
    expect(screen.getByText('PDF page 200')).toBeVisible();
    expect(document.querySelector('[data-pdf-unpainted]')).toBeNull();
    expect(screen.queryByText('PDF page 1')).not.toBeInTheDocument();
    // (200 - 1) pages * (300px measured height + 12px gap).
    expect(scroller?.scrollTop).toBe(199 * 312);
    rect.mockRestore();
  });

  it('does not re-jump continuous-scroll after the reader scrolls away', async () => {
    documentPageCount.value = 400;
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getBoundingClientRect(this: HTMLElement) {
        const page = this instanceof HTMLElement && this.hasAttribute('data-page');
        return {
          bottom: page ? 300 : 700,
          height: page ? 300 : 700,
          left: 0,
          right: 320,
          top: 0,
          width: 320,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      });

    laidOut();
    render(
      <ClioDocumentPdfViewer
        bytes={new Uint8Array([37, 80, 68, 70])}
        initialPage={200}
        name="thesis.pdf"
      />,
    );
    await screen.findByText('PDF page 200');
    const scroller = document.querySelector<HTMLElement>('[data-pdf-scroller]');
    expect(scroller).not.toBeNull();

    // The reader scrolls back to the top themselves; a later remeasurement
    // (e.g. a zoom change re-running measurePage) must never jump them back.
    scroller!.scrollTop = 0;
    fireEvent.scroll(scroller!);
    await screen.findByText('PDF page 1');

    expect(scroller?.scrollTop).toBe(0);
    rect.mockRestore();
  });

  it('windows a long document instead of mounting every page', async () => {
    documentPageCount.value = 400;
    // JSDOM has no layout. Give the viewer and rendered pages the bounded
    // geometry supplied by a real canvas host, including narrow-pane support.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        const height = this.hasAttribute('data-page') ? 300 : 700;
        return {
          bottom: height,
          height,
          left: 0,
          right: 320,
          top: 0,
          width: 320,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      },
    );
    render(<ClioDocumentPdfViewer bytes={new Uint8Array([37, 80, 68, 70])} name="thesis.pdf" />);

    expect(await screen.findByText('PDF page 1')).toBeVisible();
    // Only the visible window plus its overscan is mounted; a 400-page document
    // mounting every page is hundreds of megabytes of canvas in the tab.
    expect(screen.getAllByText(/^PDF page \d+$/u)).toHaveLength(3);
    expect(screen.queryByText('PDF page 200')).not.toBeInTheDocument();
    expect(screen.queryByText('PDF page 400')).not.toBeInTheDocument();
    // The window follows this element's scroll position, so the viewer has to
    // own a scroll region rather than riding whatever ancestor happens to
    // scroll — every host has to give it a bounded box.
    const spacer = document.querySelector<HTMLElement>('[data-pdf-spacer="leading"]');
    const scroller = document.querySelector<HTMLElement>('[data-pdf-scroller]');
    expect(scroller?.className).toContain('overflow-auto');
    expect(scroller?.contains(spacer as Node)).toBe(true);
    // The unmounted pages still hold their space, so the scrollbar keeps
    // reporting the whole document.
    const trailing = document.querySelector<HTMLElement>('[data-pdf-spacer="trailing"]');
    expect(Number.parseFloat(trailing?.style.height ?? '0')).toBeGreaterThan(100_000);
    expect(
      Number.parseFloat(
        document.querySelector<HTMLElement>('[data-pdf-spacer="leading"]')?.style.height ?? '0',
      ),
    ).toBe(0);
  });

  it('does not measure a loading page placeholder as rendered page geometry', async () => {
    documentPageCount.value = 400;
    pageRenderReady.value = false;
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getBoundingClientRect(this: HTMLElement) {
        const page = this instanceof HTMLElement && this.hasAttribute('data-page');
        return {
          bottom: page ? 2 : 700,
          height: page ? 2 : 700,
          left: 0,
          right: 320,
          top: 0,
          width: 320,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      });

    render(<ClioDocumentPdfViewer bytes={new Uint8Array([37, 80, 68, 70])} name="thesis.pdf" />);

    expect(await screen.findByText('PDF page 1')).toBeVisible();
    const trailing = document.querySelector<HTMLElement>('[data-pdf-spacer="trailing"]');
    expect(Number.parseFloat(trailing?.style.height ?? '0')).toBeGreaterThan(100_000);
    rect.mockRestore();
  });

  it('groups the tightened zoom controls', async () => {
    render(<ClioDocumentPdfViewer bytes={new Uint8Array([37, 80, 68, 70])} name="paper.pdf" />);

    const zoom = await screen.findByRole('group', { name: 'PDF zoom' });
    expect(zoom).toContainElement(screen.getByRole('button', { name: 'Zoom out' }));
    expect(zoom).toContainElement(screen.getByRole('button', { name: 'Zoom in' }));
  });
});
