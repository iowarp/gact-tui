import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioDocumentPdfViewer } from './document-pdf-viewer';

afterEach(cleanup);

const documentPageCount = vi.hoisted(() => ({ value: 3 }));
const pageRenderReady = vi.hoisted(() => ({ value: true }));

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
      onRenderSuccess,
      pageNumber,
    }: {
      onRenderSuccess?: () => void;
      pageNumber: number;
    }) => {
      // Fires once per mounted page, keyed on the page identity -- matching
      // real react-pdf, which re-renders a page's canvas (and re-fires this)
      // on its OWN geometry changing, never merely because a caller's inline
      // callback got a fresh reference. Keying on `onRenderSuccess` itself
      // (an inline arrow recreated every parent render in the real
      // component) turned a real measurement into an infinite render loop
      // that only this mock's naive re-firing could produce.
      React.useEffect(() => {
        if (pageRenderReady.value) onRenderSuccess?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [pageNumber]);
      return <div>PDF page {pageNumber}</div>;
    },
  };
});

afterEach(() => {
  documentPageCount.value = 3;
  pageRenderReady.value = true;
});

describe('ClioDocumentPdfViewer', () => {
  it('defaults to continuous scrolling and can switch to paged navigation', async () => {
    const user = userEvent.setup();
    render(
      <ClioDocumentPdfViewer
        bytes={new Uint8Array([37, 80, 68, 70])}
        name="paper.pdf"
        onSelection={vi.fn()}
      />,
    );

    expect(await screen.findByText('PDF page 1')).toBeVisible();
    expect(screen.getByText('PDF page 2')).toBeVisible();
    expect(screen.getByText('PDF page 3')).toBeVisible();
    expect(screen.getByText('3 pages')).toBeVisible();

    const pagedToggle = screen.getByRole('button', { name: 'Use paged PDF view' });
    expect(pagedToggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(pagedToggle);

    expect(pagedToggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Page 1 of 3')).toBeVisible();
    expect(screen.queryByText('PDF page 2')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next PDF page' }));
    expect(screen.getByText('PDF page 2')).toBeVisible();
  });

  it('opens on the requested initial page in paged view', async () => {
    const user = userEvent.setup();
    render(
      <ClioDocumentPdfViewer
        bytes={new Uint8Array([37, 80, 68, 70])}
        initialPage={2}
        name="paper.pdf"
        onSelection={vi.fn()}
      />,
    );

    await screen.findByText('PDF page 1');
    await user.click(screen.getByRole('button', { name: 'Use paged PDF view' }));

    expect(screen.getByText('Page 2 of 3')).toBeVisible();
    expect(screen.getByText('PDF page 2')).toBeVisible();
  });

  it('jumps continuous-scroll to the requested initial page once a real page height is known', async () => {
    documentPageCount.value = 400;
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
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
      },
    );

    render(
      <ClioDocumentPdfViewer
        bytes={new Uint8Array([37, 80, 68, 70])}
        initialPage={200}
        name="thesis.pdf"
        onSelection={vi.fn()}
      />,
    );

    // Page 1 renders first (scroll starts at 0) so its real height can be
    // measured; the jump to page 200 follows once that measurement lands.
    expect(await screen.findByText('PDF page 200')).toBeVisible();
    expect(screen.queryByText('PDF page 1')).not.toBeInTheDocument();
    const scroller = document.querySelector<HTMLElement>('[data-pdf-scroller]');
    // (200 - 1) pages * (300px measured height + 12px gap).
    expect(scroller?.scrollTop).toBe(199 * 312);
    rect.mockRestore();
  });

  it('does not re-jump continuous-scroll after the reader scrolls away', async () => {
    documentPageCount.value = 400;
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
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
      },
    );

    render(
      <ClioDocumentPdfViewer
        bytes={new Uint8Array([37, 80, 68, 70])}
        initialPage={200}
        name="thesis.pdf"
        onSelection={vi.fn()}
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
    render(
      <ClioDocumentPdfViewer
        bytes={new Uint8Array([37, 80, 68, 70])}
        name="thesis.pdf"
        onSelection={vi.fn()}
      />,
    );

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
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
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
      },
    );

    render(
      <ClioDocumentPdfViewer
        bytes={new Uint8Array([37, 80, 68, 70])}
        name="thesis.pdf"
        onSelection={vi.fn()}
      />,
    );

    expect(await screen.findByText('PDF page 1')).toBeVisible();
    const trailing = document.querySelector<HTMLElement>('[data-pdf-spacer="trailing"]');
    expect(Number.parseFloat(trailing?.style.height ?? '0')).toBeGreaterThan(100_000);
    rect.mockRestore();
  });

  it('groups the tightened zoom controls', async () => {
    render(
      <ClioDocumentPdfViewer
        bytes={new Uint8Array([37, 80, 68, 70])}
        name="paper.pdf"
        onSelection={vi.fn()}
      />,
    );

    const zoom = await screen.findByRole('group', { name: 'PDF zoom' });
    expect(zoom).toContainElement(screen.getByRole('button', { name: 'Zoom PDF out' }));
    expect(zoom).toContainElement(screen.getByRole('button', { name: 'Zoom PDF in' }));
  });
});
