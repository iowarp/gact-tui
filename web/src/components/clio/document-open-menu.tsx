import type { Artifact, DocumentEditorHealth, DocumentManifest } from '@clio/core/v3';
import { ChevronDownIcon, CopyIcon, DownloadIcon, ExternalLinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { fileFormatLabel } from '@/lib/media-types';
import { inTauri } from '@/lib/transport/tauri-runtime';
import type { DocumentApplication } from '@/tauri/documents';
import { FileTypeIcon } from './file-type-icon';
import { isHtmlFile } from './html-preview-policy';
import { documentOpenPolicy } from './document-open-policy';

export type DocumentOpenTarget =
  | 'native'
  | 'word'
  | 'powerpoint'
  | 'excel'
  | 'onlyoffice'
  | 'collabora';

const applicationLabels = { word: 'Word', powerpoint: 'PowerPoint', excel: 'Excel' };

/** Only offer installed native apps and healthy configured browser editors. */
export function DocumentOpenMenu({
  artifact,
  manifest,
  hasPdf,
  applications,
  editorHealth,
  openPending,
  pdfPending,
  downloadPending,
  onOpen,
  onPdf,
  onDownload,
  hideDownload = false,
  onPreview,
  onSource,
}: {
  artifact: Artifact;
  manifest: DocumentManifest;
  hasPdf: boolean;
  applications: readonly DocumentApplication[];
  editorHealth?: DocumentEditorHealth;
  openPending: boolean;
  pdfPending: boolean;
  downloadPending: boolean;
  onOpen: (target: DocumentOpenTarget) => void;
  onPdf: () => void;
  onDownload: () => void;
  hideDownload?: boolean;
  onPreview?: () => void;
  onSource?: () => void;
}) {
  const native = inTauri();
  const html = manifest.profile === 'html-static' || isHtmlFile(artifact.name, artifact.media_type);
  const policy = documentOpenPolicy(
    html ? 'html-static' : manifest.profile,
    artifact.name,
    artifact.media_type,
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Open in"
          title="Open in"
          className="h-7 gap-1 px-2 text-xs @max-[520px]/viewer:px-1.5"
          size="sm"
          variant="outline"
        >
          <FileTypeIcon name={artifact.name} mediaType={artifact.media_type} className="size-3.5" />
          <span className="@max-[520px]/viewer:sr-only">Open in</span>{' '}
          <ChevronDownIcon aria-hidden="true" className="size-3 @max-[360px]/viewer:hidden" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {policy.previewLabel && onPreview ? (
          <DropdownMenuItem onSelect={onPreview}>
            <FileTypeIcon name={artifact.name} mediaType={artifact.media_type} />
            {policy.previewLabel}
          </DropdownMenuItem>
        ) : null}
        {policy.sourceLabel && onSource ? (
          <DropdownMenuItem onSelect={onSource}>
            <FileTypeIcon name={artifact.name} mediaType={artifact.media_type} />
            {policy.sourceLabel}
          </DropdownMenuItem>
        ) : null}
        {policy.pdfPreview && (hasPdf || manifest.rendition_formats.includes('pdf')) ? (
          <DropdownMenuItem disabled={pdfPending} onSelect={onPdf}>
            <FileTypeIcon name="preview.pdf" className="size-4 text-red-600" />
            {pdfPending ? 'Preparing PDF…' : 'PDF preview'}
          </DropdownMenuItem>
        ) : null}
        {manifest.native_open && native ? (
          <>
            {applications
              .filter((app) => policy.applications.includes(app))
              .map((app) => (
                <DropdownMenuItem key={app} disabled={openPending} onSelect={() => onOpen(app)}>
                  <FileTypeIcon name={artifact.name} mediaType={artifact.media_type} />
                  Open in {applicationLabels[app]}
                </DropdownMenuItem>
              ))}
            <DropdownMenuItem disabled={openPending} onSelect={() => onOpen('native')}>
              <ExternalLinkIcon aria-hidden="true" />
              {policy.nativeLabel}
            </DropdownMenuItem>
          </>
        ) : null}
        {(policy.embeddedEditors ? manifest.embedded_editors : []).map((provider) => {
          const health = editorHealth?.editors.find((entry) => entry.provider === provider);
          if (!health?.configured) return null;
          return (
            <DropdownMenuItem
              disabled={openPending || !health.healthy}
              key={provider}
              onSelect={() => onOpen(provider)}
              title={health.error}
            >
              <ExternalLinkIcon aria-hidden="true" />
              {provider === 'onlyoffice' ? 'ONLYOFFICE' : 'Collabora'}
              {!health.healthy ? ' — unavailable' : ''}
            </DropdownMenuItem>
          );
        })}
        {!hideDownload ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={downloadPending} onSelect={onDownload}>
              <DownloadIcon aria-hidden="true" />
              Download {fileFormatLabel(artifact.name, artifact.media_type)} file
            </DropdownMenuItem>
          </>
        ) : null}
        {manifest.native_open && !native ? (
          <DropdownMenuItem disabled={openPending} onSelect={() => onOpen('native')}>
            <CopyIcon aria-hidden="true" />
            Copy path
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
