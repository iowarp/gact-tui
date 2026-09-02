import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioDocumentPdfViewer } from './document-pdf-viewer';

afterEach(cleanup);

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
      React.useEffect(() => onLoadSuccess({ numPages: 3 }), [onLoadSuccess]);
      return <div>{children}</div>;
    },
    Page: ({ pageNumber }: { pageNumber: number }) => <div>PDF page {pageNumber}</div>,
  };
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
