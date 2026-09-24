import { FileTextIcon } from 'lucide-react';
import { lazy, Suspense } from 'react';
import type { DocumentAnchor } from '@clio/core/v3';
import { ResourceLoading, ResourceUnavailable } from './resource-states';

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
  onSelection,
}: {
  bytes?: Uint8Array;
  error?: string;
  name: string;
  fit?: 'page' | 'width';
  onSelection?: (anchor: DocumentAnchor) => void;
}) {
  if (error) {
    return <ResourceUnavailable detail={error} icon={FileTextIcon} label="PDF preview unavailable" />;
  }
  if (!bytes) return <ResourceLoading className="p-4" label={`Loading ${name}`} />;
  return (
    <Suspense fallback={<ResourceLoading className="p-4" label={`Loading ${name}`} />}>
      <ClioDocumentPdfViewer
        bytes={bytes}
        fit={fit}
        name={name}
        onSelection={onSelection ?? (() => undefined)}
      />
    </Suspense>
  );
}
