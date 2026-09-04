import { cleanup, render, screen } from '@testing-library/react';
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
      React.useEffect(() => {
        if (pageRenderReady.value) onRenderSuccess?.();
      }, [onRenderSuccess]);
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
