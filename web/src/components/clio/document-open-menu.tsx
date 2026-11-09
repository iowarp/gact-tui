import type { Artifact, DocumentManifest } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { ExternalLinkIcon, FileTextIcon, FolderOpenIcon, XIcon } from 'lucide-react';
import { useMemo } from 'react';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { documentApplications, type DocumentApplication } from '@/tauri/documents';
import { AssociatedApplicationItems } from './associated-application-items';
import type { FileViewerAction } from './file-viewer-action-context';

export interface DocumentOpenTarget {
  kind: 'native';
  application: DocumentApplication;
  format: 'original' | 'pdf';
}

interface DocumentOpenHandlers {
  onOpen: (target: DocumentOpenTarget) => void;
  onReveal: () => void;
  onPdf: () => Promise<void>;
  onCloseWorkingCopy: () => void;
}

/** Whether the document has a PDF copy beside its original. */
export function documentHasPdf(manifest: DocumentManifest | undefined) {
  return Boolean(
    manifest &&
      manifest.profile !== 'pdf' &&
      (manifest.pdf_rendition_artifact_id || manifest.rendition_formats.includes('pdf')),
  );
}

/**
 * A document's rows in the frame's Open ▾, so it has one Open like any file:
 * With another app edits its working copy (or shows a desktop copy in its
 * folder), PDF copy opens the rendition in a PDF app, Close working copy ends
 * an open one, and its PDF joins Export to…. Register them with
 * `useFileViewerActions`; the app rows are desktop-only. Pass stable handlers:
 * the rows are rebuilt whenever one changes.
 */
export function useDocumentOpenActions({
  artifact,
  manifest,
  openPending,
  pdfPending,
  revealPending,
  workingCopyActive,
  closePending,
  onOpen,
  onReveal,
  onPdf,
  onCloseWorkingCopy,
}: {
  artifact: Artifact;
  manifest?: DocumentManifest;
  openPending: boolean;
  pdfPending: boolean;
  revealPending: boolean;
  workingCopyActive: boolean;
  closePending: boolean;
} & DocumentOpenHandlers): readonly FileViewerAction[] {
  const native = inTauri();
  const pdf = documentHasPdf(manifest);
  const nativeOpen = native && Boolean(manifest?.native_open);
  const applications = useQuery({
    queryKey: ['document-applications', artifact.name, artifact.media_type],
    queryFn: () => documentApplications(artifact.name, artifact.media_type),
    enabled: nativeOpen,
    staleTime: 60_000,
  });
  const pdfApplications = useQuery({
    queryKey: ['document-applications', 'file.pdf', 'application/pdf'],
    queryFn: () => documentApplications('file.pdf', 'application/pdf'),
    enabled: native && pdf,
    staleTime: 60_000,
  });
  const busy = openPending || pdfPending || revealPending;
  return useMemo<FileViewerAction[]>(() => {
    if (!manifest) return [];
    const open = (application: DocumentApplication, format: DocumentOpenTarget['format']) =>
      onOpen({ kind: 'native', application, format });
    const rows: FileViewerAction[] = [];
    if (native)
      rows.push({
        kind: 'open',
        label: 'With another app',
        description: nativeOpen ? 'Edits become new revisions' : undefined,
        icon: ExternalLinkIcon,
        pending: openPending,
        onSelect: () => undefined,
        submenu: (
          <>
            {nativeOpen ? (
              <>
                <AssociatedApplicationItems
                  applications={applications.data ?? []}
                  pending={applications.isPending}
                  error={applications.error?.message}
                  disabled={busy}
                  onSelect={(application) => open(application, 'original')}
                />
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem disabled={busy} onSelect={onReveal}>
              <FolderOpenIcon aria-hidden="true" />
              Open in folder
            </DropdownMenuItem>
          </>
        ),
      });
    if (native && pdf)
      rows.push({
        kind: 'open',
        label: 'PDF copy with another app',
        icon: FileTextIcon,
        onSelect: () => undefined,
        submenu: (
          <AssociatedApplicationItems
            applications={pdfApplications.data ?? []}
            pending={pdfApplications.isPending}
            error={pdfApplications.error?.message}
            disabled={busy}
            pdfCopy
            onSelect={(application) => open(application, 'pdf')}
          />
        ),
      });
    if (workingCopyActive)
      rows.push({
        kind: 'open',
        label: 'Close working copy',
        description: closePending ? 'Closing…' : undefined,
        icon: XIcon,
        disabled: closePending,
        pending: closePending,
        onSelect: onCloseWorkingCopy,
      });
    if (pdf)
      rows.push({
        kind: 'download',
        label: 'PDF',
        icon: FileTextIcon,
        pending: pdfPending,
        onSelect: onPdf,
      });
    return rows;
  }, [
    manifest,
    native,
    nativeOpen,
    pdf,
    busy,
    openPending,
    pdfPending,
    workingCopyActive,
    closePending,
    onOpen,
    onReveal,
    onPdf,
    onCloseWorkingCopy,
    applications.data,
    applications.isPending,
    applications.error,
    pdfApplications.data,
    pdfApplications.isPending,
    pdfApplications.error,
  ]);
}
