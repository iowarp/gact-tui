import { lazy, Suspense } from 'react';
import type { DocumentAnchor } from '@clio/core/v3';
import type { PdfHighlight } from './document-pdf-viewer';
import { ResourceLoading, ViewerReadError } from './resource-states';

const ClioDocumentPdfViewer = lazy(() =>
  import('./document-pdf-viewer').then((module) => ({ default: module.ClioDocumentPdfViewer })),
);

/**
 * The one PDF preview every surface uses: attachments, sources, derivatives,
 * documents and workspace files.
 *
 * Callers load the bytes through their own data path (the repository, or a
 * local attachment) and hand them over. The viewer never fetches a URL itself,
 * because on the desktop every backend request has to go through the app's
 * transport, and pdf.js fetching on its own bypasses it.
 */
export function ClioPdfPreview({
  bytes,
  error,
  name,
  fit,
  initialPage,
  onSelection,
  highlight,
  onPagePoint,
  onRetry,
}: {
  bytes?: Uint8Array;
  error?: string;
  onRetry?: () => void;
  name: string;
  fit?: 'page' | 'width';
  /** Opens on this 1-based page instead of the first, when the caller already
   * knows which page matters (e.g. a view_pdf call's viewed page range). */
  initialPage?: number;
  onSelection?: (anchor: DocumentAnchor) => void;
  /** Outlined and scrolled into view on its page. */
  highlight?: PdfHighlight;
  /** A double-click on a page (0-based) at x, y as fractions of the page. */
  onPagePoint?: (page: number, x: number, y: number) => void;
}) {
  if (error) return <ViewerReadError error={error} onRetry={onRetry} />;
  if (!bytes) return <ResourceLoading className="p-4" label={`Loading ${name}`} />;
  return (
    <Suspense fallback={<ResourceLoading className="p-4" label={`Loading ${name}`} />}>
      <ClioDocumentPdfViewer
        bytes={bytes}
        fit={fit}
        initialPage={initialPage}
        name={name}
        onSelection={onSelection ?? (() => undefined)}
        highlight={highlight}
        onPagePoint={onPagePoint}
      />
    </Suspense>
  );
}
