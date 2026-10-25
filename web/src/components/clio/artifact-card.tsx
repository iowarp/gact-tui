import { queryKeys } from '@/lib/query-keys';
import {
  artifactEvidenceLabel,
  isDocumentPreview,
  latestResponseArtifacts,
} from '@/lib/artifact-presentation';
import type { Artifact as ArtifactEntity } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { DownloadIcon, GitBranchIcon, TriangleAlertIcon } from 'lucide-react';
import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { toast } from 'sonner';
import {
  Artifact,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from '@/components/ai-elements/artifact';
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
  type AttachmentData,
} from '@/components/ai-elements/attachments';
import { MessageResponse } from '@/components/ai-elements/message';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useObjectUrl } from '@/hooks/use-object-url';
import { formatBytes } from '@/lib/format';
import { fileFormatLabel } from '@/lib/media-types';
import { artifactDisplayName, isDashboardArtifact } from '@/lib/dashboard-presentation';
import {
  IMMUTABLE_QUERY,
  INLINE_PREVIEW_MAX_BYTES,
  TEXT_PREVIEW_MAX_BYTES,
  TEXT_PREVIEW_RENDER_CHARS,
} from '@/lib/runtime-limits';
import { cn } from '@/lib/utils';
import { describeReferenceError } from '@/lib/a2ui/reference-failure';
import {
  isMissingArtifactPayload,
  uniqueWorkspaceArtifactFile,
  verifyArtifactRecovery,
} from './artifact-custody';
import { downloadBytes } from './surface-export';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArtifactTypeIcon } from './artifact-type-icon';
import { fileRowTint } from '@/lib/file-presentation';
import { ClioRelativeTime } from './relative-time';

export interface ClioArtifactCardProps {
  artifact: ArtifactEntity;
  className?: string;
  onOpen?: (
    artifact: ArtifactEntity,
    event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>,
  ) => void;
  preview?: boolean;
  presentation?: 'response' | 'evidence';
  /** Recorded producer identity stays inspectable without a repeated caption below each row. */
  ownerLabel?: string;
}

export interface ClioArtifactAttachmentsProps {
  artifacts: readonly ArtifactEntity[];
  className?: string;
  onOpen?: (
    artifact: ArtifactEntity,
    event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>,
  ) => void;
}

/** Presents transcript outputs with the same compact rows as the Artifacts canvas. */
export function ClioArtifactAttachments({
  artifacts,
  className,
  onOpen,
}: ClioArtifactAttachmentsProps) {
  const deliverables = latestResponseArtifacts(artifacts);
  if (!deliverables.length) return null;
  return (
    <div
      aria-label={deliverables.length === 1 ? 'Artifact' : `${deliverables.length} artifacts`}
      className={cn('flex w-full min-w-0 flex-col gap-2 py-1', className)}
      role="group"
    >
      {deliverables.map((artifact) => {
        const output = artifact.session_relation
          ? artifact
          : { ...artifact, session_relation: 'produced' as const };
        return (
          <ClioArtifactCard
            artifact={output}
            className="w-full shadow-none"
            key={artifact.id}
            onOpen={onOpen}
            preview={false}
            presentation="response"
          />
        );
      })}
    </div>
  );
}

/** Maps a GACT artifact into AI Elements' artifact and attachment presentation. */
export function ClioArtifactCard(props: ClioArtifactCardProps) {
  return !props.presentation && isDocumentPreview(props.artifact) ? null : (
    <ArtifactCardContent {...props} />
  );
}

function ArtifactCardContent({
  artifact,
  className,
  onOpen,
  preview = true,
  presentation,
  ownerLabel,
}: ClioArtifactCardProps) {
  const repository = useRepository();
  const [downloading, setDownloading] = useState(false);
  const displayName = artifactDisplayName(artifact);
  const { settings } = useConnectionSettings();
  const image = isImageArtifact(artifact);
  const text = isTextArtifact(artifact);
  const tabular = isTabularArtifact(artifact);
  const withinBudget = artifact.size !== undefined && artifact.size <= INLINE_PREVIEW_MAX_BYTES;
  const textWithinBudget = artifact.size !== undefined && artifact.size <= TEXT_PREVIEW_MAX_BYTES;
  const imageBytes = useQuery({
    queryKey: queryKeys.key(
      'artifact-card-image',
      settings.endpoint,
      artifact.id,
      artifact.fetch_path,
    ),
    queryFn: async ({ signal }) => {
      try {
        return await repository.readArtifactBytesFor(artifact, signal);
      } catch (error) {
        if (!isMissingArtifactPayload(error) || !artifact.workspace_id) throw error;
        const { entries } = await repository.workspaceFiles(artifact.workspace_id, signal, {
          excludeServiceStorage: true,
        });
        const fallback = uniqueWorkspaceArtifactFile(artifact, artifact.workspace_id, entries);
        if (!fallback) throw error;
        const bytes = await repository.readWorkspaceFileBytes(
          artifact.workspace_id,
          fallback.path,
          signal,
        );
        await verifyArtifactRecovery(artifact, bytes, fallback.path);
        return bytes;
      }
    },
    enabled: preview && image && withinBudget,
    ...IMMUTABLE_QUERY,
  });
  const imageUrl = useObjectUrl(
    imageBytes.data,
    artifact.media_type || imageMediaType(artifact.name),
  );
  const textPreview = useQuery({
    queryKey: queryKeys.key(
      'artifact-card-text',
      settings.endpoint,
      artifact.id,
      artifact.fetch_path,
    ),
    queryFn: async ({ signal }) => {
      try {
        return await repository.readArtifactTextFor(artifact, signal);
      } catch (error) {
        if (!isMissingArtifactPayload(error) || !artifact.workspace_id) throw error;
        const { entries } = await repository.workspaceFiles(artifact.workspace_id, signal, {
          excludeServiceStorage: true,
        });
        const fallback = uniqueWorkspaceArtifactFile(artifact, artifact.workspace_id, entries);
        if (!fallback) throw error;
        const bytes = await repository.readWorkspaceFileBytes(
          artifact.workspace_id,
          fallback.path,
          signal,
        );
        await verifyArtifactRecovery(artifact, bytes, fallback.path);
        return new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }).decode(bytes);
      }
    },
    enabled: preview && text && !tabular && textWithinBudget,
    ...IMMUTABLE_QUERY,
  });
  const attachment: AttachmentData = {
    type: 'file',
    id: artifact.id,
    filename: artifact.name,
    mediaType: artifact.media_type,
    url: imageUrl ?? '',
  };
  const contentError = imageBytes.error ?? textPreview.error;
  // A missing payload keeps the custody wording; any other failure (a remote
  // service refusing the token, an unreachable host) names its real reason.
  const contentFailure =
    contentError && !isMissingArtifactPayload(contentError)
      ? describeReferenceError(contentError)
      : undefined;

  // G0 (`clio.artifact.v1`: "download; open" — "open" is the existing
  // `onOpen` click). Fetched on demand, independent of the preview query
  // above (which is gated to images within the inline preview budget) — a
  // download must reach the artifact regardless of size or media type.
  const downloadOriginal = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const bytes = await repository.readArtifactBytesFor(artifact);
      downloadBytes(bytes, artifact.media_type || 'application/octet-stream', artifact.name);
    } catch (error) {
      toast.error('Could not download artifact', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Artifact
      className={cn(
        'group/artifact group relative isolate',
        fileRowTint(artifact.name, artifact.media_type),
        onOpen &&
          'transition-[background-color,border-color] hover:border-primary/50 hover:bg-accent/60',
        presentation === 'evidence' &&
          'rounded-md border-transparent bg-transparent shadow-none hover:border-transparent',
        className,
      )}
    >
      <ArtifactHeader
        className={cn(
          'gap-2.5 px-3 py-2',
          onOpen && 'group-hover/artifact:bg-accent/60',
          presentation === 'evidence' && 'border-0 bg-transparent px-2',
        )}
      >
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center',
            presentation === 'evidence' && 'size-6',
          )}
        >
          <ArtifactTypeIcon
            artifact={artifact}
            badge
            className={presentation === 'evidence' ? 'size-6' : 'size-9'}
          />
        </span>
        <div className="min-w-0 flex-1">
          {onOpen ? (
            // Stretch a native button's hit area across the card. Toolbar
            // controls and preview links sit above it as independent siblings,
            // so the whole card opens without nesting interactive controls.
            <button
              aria-label={`Open ${displayName}`}
              className="block w-full truncate text-left text-sm font-medium text-foreground outline-none after:absolute after:inset-0 after:z-10 after:cursor-pointer after:rounded-lg after:content-[''] group-hover/artifact:text-primary focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
              onClick={(event) => onOpen(artifact, event as unknown as MouseEvent<HTMLDivElement>)}
              title={displayName}
              type="button"
            >
              {displayName}
            </button>
          ) : (
            <ArtifactTitle className="truncate text-foreground">{displayName}</ArtifactTitle>
          )}
          <ArtifactDescription
            className="flex gap-2 truncate text-xs"
            title={artifact.media_type || 'Media type unavailable'}
          >
            <span>
              {isDashboardArtifact(artifact)
                ? 'Dashboard'
                : fileFormatLabel(artifact.name, artifact.media_type)}
            </span>
            {artifact.size === undefined ? null : <span>{formatBytes(artifact.size)}</span>}
            {artifact.version === undefined ? null : <span>v{artifact.version}</span>}
            {artifact.created_at ? (
              <ClioRelativeTime
                timestamp={artifact.created_at}
                label="Created"
                compact
                className="text-xs"
              />
            ) : null}
          </ArtifactDescription>
        </div>
        {artifact.session_relation &&
        (presentation !== 'evidence' || artifact.session_relation === 'used') ? (
          <Badge className="shrink-0" variant="outline">
            {presentation === 'evidence'
              ? artifactEvidenceLabel(artifact)
              : artifact.session_relation === 'produced'
                ? 'Output'
                : 'Input'}
          </Badge>
        ) : null}
        <div className="relative z-20 shrink-0 text-foreground">
          {ownerLabel ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Provenance for ${displayName}`}
                  title="Artifact provenance"
                >
                  <GitBranchIcon aria-hidden="true" className="size-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-2 text-sm">
                <p className="font-medium">Artifact provenance</p>
                <p>Generated by {ownerLabel}</p>
                <p className="break-all text-xs text-muted-foreground">{artifact.uri}</p>
              </PopoverContent>
            </Popover>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Download ${displayName}`}
            title="Download original file"
            disabled={downloading}
            onClick={() => void downloadOriginal()}
          >
            <DownloadIcon className="size-4" />
          </Button>
        </div>
      </ArtifactHeader>
      {preview && !isDashboardArtifact(artifact) ? (
        <ArtifactContent className="p-0 text-foreground [&_a]:relative [&_a]:z-20 [&_button]:relative [&_button]:z-20">
          {textPreview.data ? (
            <div className="relative max-h-44 overflow-hidden border-t bg-muted/15 px-4 py-3">
              {isMarkdownArtifact(artifact) ? (
                <MessageResponse className="text-sm leading-6">
                  {textPreview.data.slice(0, TEXT_PREVIEW_RENDER_CHARS)}
                </MessageResponse>
              ) : (
                <pre className="overflow-hidden whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
                  {textPreview.data.slice(0, TEXT_PREVIEW_RENDER_CHARS)}
                </pre>
              )}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent"
              />
            </div>
          ) : image || !text ? (
            <Attachments
              className={cn('m-0 w-full', image ? 'block' : 'gap-0')}
              variant={image ? 'grid' : 'list'}
            >
              <Attachment
                className={cn(
                  'border-0 bg-muted/20',
                  image ? 'h-36 w-full rounded-none' : 'rounded-none',
                )}
                data={attachment}
              >
                <AttachmentPreview
                  className={cn(
                    image && 'size-full min-h-36 rounded-none bg-muted/40 [&_img]:object-contain',
                  )}
                />
                {!image ? <AttachmentInfo showMediaType /> : null}
              </Attachment>
            </Attachments>
          ) : null}
          {image && imageBytes.isPending && withinBudget ? (
            <p className="px-4 py-2 text-xs text-muted-foreground">Loading image preview…</p>
          ) : null}
          {image && !withinBudget ? (
            <p className="px-4 py-2 text-xs text-muted-foreground">
              {artifact.size === undefined
                ? 'Preview withheld because the service did not report a size for this image.'
                : `Preview withheld because this image exceeds the ${formatBytes(INLINE_PREVIEW_MAX_BYTES)} card budget. Open it for the full view.`}
            </p>
          ) : null}
          {text && !tabular && textPreview.isPending && textWithinBudget ? (
            <p className="px-4 py-2 text-xs text-muted-foreground">Loading artifact preview…</p>
          ) : null}
          {text && !tabular && !textWithinBudget ? (
            <p className="px-4 py-2 text-xs text-muted-foreground">
              {artifact.size === undefined
                ? 'Preview withheld because the service did not report a size for this artifact.'
                : `Open this artifact to read the full ${formatBytes(artifact.size)} result.`}
            </p>
          ) : null}
          {contentError ? (
            <Alert
              className="m-3 w-auto border-warning/35 bg-warning/5"
              data-reason={contentFailure?.code ?? 'not_found'}
            >
              <TriangleAlertIcon aria-hidden="true" />
              <AlertTitle>Saved content unavailable</AlertTitle>
              <AlertDescription>
                {contentFailure
                  ? contentFailure.message
                  : 'The service remembers this result, but its saved content is no longer available. Inspect its details for custody and provenance.'}
              </AlertDescription>
            </Alert>
          ) : null}
        </ArtifactContent>
      ) : null}
    </Artifact>
  );
}

function isImageArtifact(artifact: ArtifactEntity) {
  return (
    artifact.media_type.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'].includes(
      artifact.name.split('.').at(-1)?.toLowerCase() ?? '',
    )
  );
}

function isTextArtifact(artifact: ArtifactEntity) {
  return (
    artifact.media_type.startsWith('text/') ||
    ['json', 'md', 'markdown', 'csv', 'txt', 'yaml', 'yml'].includes(
      artifact.name.split('.').at(-1)?.toLowerCase() ?? '',
    )
  );
}

function isMarkdownArtifact(artifact: ArtifactEntity) {
  return (
    ['text/markdown', 'text/x-markdown'].includes(artifact.media_type) ||
    ['md', 'markdown'].includes(artifact.name.split('.').at(-1)?.toLowerCase() ?? '')
  );
}

function isTabularArtifact(artifact: ArtifactEntity) {
  return (
    ['text/csv', 'text/tab-separated-values'].includes(artifact.media_type) ||
    ['csv', 'tsv'].includes(artifact.name.split('.').at(-1)?.toLowerCase() ?? '')
  );
}

function imageMediaType(path: string): string {
  const extension = path.split('.').at(-1)?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'avif') return 'image/avif';
  return 'image/png';
}
