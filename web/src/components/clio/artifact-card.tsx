import { queryKeys } from '@/lib/query-keys';
import type { Artifact as ArtifactEntity } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { TriangleAlertIcon } from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';
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
import {
  IMMUTABLE_QUERY,
  INLINE_PREVIEW_MAX_BYTES,
  TEXT_PREVIEW_MAX_BYTES,
  TEXT_PREVIEW_RENDER_CHARS,
} from '@/lib/runtime-limits';
import { cn } from '@/lib/utils';
import { isMissingArtifactPayload, uniqueWorkspaceArtifactFile } from './artifact-custody';

export interface ClioArtifactCardProps {
  artifact: ArtifactEntity;
  className?: string;
  onOpen?: (
    artifact: ArtifactEntity,
    event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>,
  ) => void;
  preview?: boolean;
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
  return (
    <div
      aria-label={artifacts.length === 1 ? 'Artifact' : `${artifacts.length} artifacts`}
      className={cn('flex w-full min-w-0 flex-col gap-2 py-1', className)}
      role="group"
    >
      {artifacts.map((artifact) => {
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
          />
        );
      })}
    </div>
  );
}

/** Maps a GACT artifact into AI Elements' artifact and attachment presentation. */
export function ClioArtifactCard({
  artifact,
  className,
  onOpen,
  preview = true,
}: ClioArtifactCardProps) {
  const repository = useRepository();
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
        const files = await repository.workspaceFiles(artifact.workspace_id, signal);
        const fallback = uniqueWorkspaceArtifactFile(artifact, artifact.workspace_id, files);
        if (!fallback) throw error;
        return repository.readWorkspaceFileBytes(artifact.workspace_id, fallback.path, signal);
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
        const files = await repository.workspaceFiles(artifact.workspace_id, signal);
        const fallback = uniqueWorkspaceArtifactFile(artifact, artifact.workspace_id, files);
        if (!fallback) throw error;
        return repository.readWorkspaceFile(artifact.workspace_id, fallback.path, signal);
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
  const contentUnavailable = Boolean(imageBytes.error || textPreview.error);

  return (
    <Artifact
      aria-label={onOpen ? `Open ${artifact.name}` : undefined}
      className={cn(
        'group/artifact',
        onOpen &&
          'cursor-pointer transition-colors hover:border-primary/60 hover:bg-muted/15 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        className,
      )}
      onClick={onOpen ? (event) => onOpen(artifact, event) : undefined}
      onKeyDown={
        onOpen
          ? (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onOpen(artifact, event);
            }
          : undefined
      }
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
    >
      <ArtifactHeader className="gap-3">
        <div className="min-w-0 flex-1">
          <ArtifactTitle className="truncate">{artifact.name}</ArtifactTitle>
          <ArtifactDescription className="truncate">
            {artifact.media_type || 'Media type unavailable'}
            {artifact.size === undefined ? '' : `, ${formatBytes(artifact.size)}`}
          </ArtifactDescription>
        </div>
        {artifact.session_relation ? (
          <Badge className="shrink-0" variant="outline">
            {artifact.session_relation === 'produced' ? 'Output' : 'Input'}
          </Badge>
        ) : null}
      </ArtifactHeader>
      {preview ? (
        <ArtifactContent className="p-0">
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
          {contentUnavailable ? (
            <Alert className="m-3 w-auto border-warning/35 bg-warning/5">
              <TriangleAlertIcon aria-hidden="true" />
              <AlertTitle>Saved content unavailable</AlertTitle>
              <AlertDescription>
                The service remembers this result, but its saved content is no longer available.
                Inspect its details for custody and provenance.
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
