import type { Artifact, DocumentManifest } from '@clio/core/v3';
import { ChevronDownIcon, FolderOpenIcon } from 'lucide-react';
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
import type { DocumentApplication } from '@/tauri/documents';
import { FileTypeIcon } from './file-type-icon';
import { AssociatedApplicationItems } from './associated-application-items';

export interface DocumentOpenTarget {
  kind: 'native';
  application: DocumentApplication;
  format: 'original' | 'pdf';
}

/** Application launching stays separate from file downloading and format conversion. */
export function DocumentOpenMenu({
  artifact,
  manifest,
  applications,
  pdfApplications,
  applicationsPending = false,
  applicationsError,
  pdfApplicationsPending = false,
  pdfApplicationsError,
  openPending,
  pdfPending,
  onOpen,
  onReveal,
  revealPending = false,
}: {
  artifact: Artifact;
  manifest: DocumentManifest;
  applications: readonly DocumentApplication[];
  pdfApplications: readonly DocumentApplication[];
  applicationsPending?: boolean;
  applicationsError?: string;
  pdfApplicationsPending?: boolean;
  pdfApplicationsError?: string;
  openPending: boolean;
  pdfPending: boolean;
  onOpen: (target: DocumentOpenTarget) => void;
  onReveal?: () => void;
  revealPending?: boolean;
}) {
  const native = inTauri();
  const pdf =
    native &&
    manifest.profile !== 'pdf' &&
    (Boolean(manifest.pdf_rendition_artifact_id) || manifest.rendition_formats.includes('pdf'));
  const label = 'Open in';
  const canReveal = native && Boolean(onReveal);
  const hasOriginal = (manifest.native_open && native) || canReveal;
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
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
