import type { Artifact, DocumentEditorHealth, DocumentManifest } from '@clio/core/v3';
import { ChevronDownIcon, DownloadIcon, ExternalLinkIcon, FolderOpenIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { fileFormatLabel } from '@/lib/media-types';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { vocab } from '@/lib/brand-vocabulary';
import type { DocumentApplication } from '@/tauri/documents';
import { FileTypeIcon } from './file-type-icon';
import { hasEmbeddedDocumentEditors } from './document-open-policy';
import { AssociatedApplicationItems } from './associated-application-items';

export type DocumentOpenTarget =
  | { kind: 'native'; application: DocumentApplication; format: 'original' | 'pdf' }
  | { kind: 'embedded'; provider: 'onlyoffice' | 'collabora' };

/** App launching, original downloads, and PDF exports stay distinct from CLIO's view controls. */
export function DocumentOpenMenu({
  artifact,
  manifest,
  applications,
  pdfApplications,
  applicationsPending = false,
  applicationsError,
  pdfApplicationsPending = false,
  pdfApplicationsError,
  editorHealth,
  openPending,
  pdfPending,
  downloadPending,
  onOpen,
  onPdfDownload,
  onDownload,
  onReveal,
  revealPending = false,
  hideDownload = false,
}: {
  artifact: Artifact;
  manifest: DocumentManifest;
  applications: readonly DocumentApplication[];
  pdfApplications: readonly DocumentApplication[];
  applicationsPending?: boolean;
  applicationsError?: string;
  pdfApplicationsPending?: boolean;
  pdfApplicationsError?: string;
  editorHealth?: DocumentEditorHealth;
  openPending: boolean;
  pdfPending: boolean;
  downloadPending: boolean;
  onOpen: (target: DocumentOpenTarget) => void;
  onPdfDownload: () => void;
  onDownload: () => void;
  onReveal?: () => void;
  revealPending?: boolean;
  hideDownload?: boolean;
}) {
  const native = inTauri();
  const pdf =
    manifest.profile !== 'pdf' &&
    (Boolean(manifest.pdf_rendition_artifact_id) || manifest.rendition_formats.includes('pdf'));
  const providers = hasEmbeddedDocumentEditors(manifest.profile) ? manifest.embedded_editors : [];
  const configuredProviders = providers.filter((provider) =>
    editorHealth?.editors.some((editor) => editor.provider === provider && editor.configured),
  );
  const label = native || configuredProviders.length ? 'Open in' : 'Export';
  const canReveal = native && Boolean(onReveal);
  const hasOriginal =
    (manifest.native_open && native) ||
    configuredProviders.length > 0 ||
    !hideDownload ||
    canReveal;
  const appItems = (
    apps: readonly DocumentApplication[],
    format: 'original' | 'pdf',
    pending: boolean,
    error?: string,
  ) => (
    <AssociatedApplicationItems
      applications={apps}
      pending={pending}
      error={error}
      disabled={openPending || pdfPending || revealPending}
      pdfCopy={format === 'pdf'}
      onSelect={(application) => onOpen({ kind: 'native', application, format })}
    />
  );
  if (!hasOriginal && !pdf) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={label}
          title={label}
          className="h-7 gap-1 px-2 text-xs @max-[520px]/viewer:px-1.5"
          size="sm"
          variant="outline"
        >
          <FileTypeIcon name={artifact.name} mediaType={artifact.media_type} className="size-3.5" />
          <span className="@max-[520px]/viewer:sr-only">{label}</span>
          <ChevronDownIcon aria-hidden="true" className="size-3 @max-[360px]/viewer:hidden" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56 max-w-72">
        {hasOriginal ? (
          <DropdownMenuGroup
            aria-label={`Original ${fileFormatLabel(artifact.name, artifact.media_type)}`}
          >
            <DropdownMenuLabel>
              {fileFormatLabel(artifact.name, artifact.media_type)}
            </DropdownMenuLabel>
            {manifest.native_open && native
              ? appItems(applications, 'original', applicationsPending, applicationsError)
              : null}
            {configuredProviders.map((provider) => {
              const health = editorHealth?.editors.find((entry) => entry.provider === provider);
              if (!health?.configured) return null;
              return (
                <DropdownMenuItem
                  disabled={openPending || !health.healthy}
                  key={provider}
                  onSelect={() => onOpen({ kind: 'embedded', provider })}
                  title={health.error}
                >
                  <ExternalLinkIcon aria-hidden="true" />
                  {provider === 'onlyoffice' ? 'ONLYOFFICE' : 'Collabora'} (in {vocab.agent})
                  {!health.healthy ? ' — unavailable' : ''}
                </DropdownMenuItem>
              );
            })}
            {!hideDownload ? (
              <DropdownMenuItem disabled={downloadPending} onSelect={onDownload}>
                <DownloadIcon aria-hidden="true" />
                Download original
              </DropdownMenuItem>
            ) : null}
            {canReveal ? (
              <DropdownMenuItem disabled={openPending || revealPending} onSelect={onReveal}>
                <FolderOpenIcon aria-hidden="true" />
                Open in folder
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
        ) : null}
        {pdf ? (
          <>
            {hasOriginal ? <DropdownMenuSeparator /> : null}
            <DropdownMenuGroup aria-label="PDF copy">
              <DropdownMenuLabel>PDF copy</DropdownMenuLabel>
              {native
                ? appItems(pdfApplications, 'pdf', pdfApplicationsPending, pdfApplicationsError)
                : null}
              <DropdownMenuItem disabled={pdfPending || openPending} onSelect={onPdfDownload}>
                <DownloadIcon aria-hidden="true" />
                {pdfPending ? 'Preparing PDF…' : 'Download PDF'}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
