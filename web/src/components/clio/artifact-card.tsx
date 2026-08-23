import type { Artifact as ArtifactEntity } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { CopyIcon, PanelsTopLeftIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
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
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { cn } from '@/lib/utils';
import { isMissingArtifactPayload, uniqueWorkspaceArtifactFile } from './artifact-custody';

const cardPreviewBudget = 8_000_000;
const textCardPreviewBudget = 256_000;

export interface ClioArtifactCardProps {
  artifact: ArtifactEntity;
  className?: string;
  onOpen?: (artifact: ArtifactEntity) => void;
  preview?: boolean;
}

/** Maps a GACT artifact into AI Elements' artifact and attachment presentation. */
export function ClioArtifactCard({
  artifact,
  className,
  onOpen,
  preview = true,
}: ClioArtifactCardProps) {
  const repository = useRepository();
  const image = isImageArtifact(artifact);
  const text = isTextArtifact(artifact);
  const withinBudget = artifact.size === undefined || artifact.size <= cardPreviewBudget;
  const textWithinBudget = artifact.size === undefined || artifact.size <= textCardPreviewBudget;
  const imageBytes = useQuery({
    queryKey: ['artifact-card-image', artifact.id, artifact.fetch_path],
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
    staleTime: Number.POSITIVE_INFINITY,
  });
  const imageUrl = useMemo(
    () =>
      imageBytes.data
        ? URL.createObjectURL(
            new Blob([new Uint8Array(imageBytes.data)], {
              type: artifact.media_type || imageMediaType(artifact.name),
            }),
          )
        : undefined,
    [artifact.media_type, artifact.name, imageBytes.data],
  );
  const textPreview = useQuery({
    queryKey: ['artifact-card-text', artifact.id, artifact.fetch_path],
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
    enabled: preview && text && textWithinBudget,
    staleTime: Number.POSITIVE_INFINITY,
  });
  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    },
    [imageUrl],
  );
  const attachment: AttachmentData = {
    type: 'file',
    id: artifact.id,
    filename: artifact.name,
    mediaType: artifact.media_type,
    url: imageUrl ?? '',
  };
  const contentUnavailable = Boolean(imageBytes.error || textPreview.error);

  return (
    <Artifact className={cn('group/artifact', className)}>
      <ArtifactHeader className="gap-3">
        <div className="min-w-0 flex-1">
          <ArtifactTitle className="truncate">{artifact.name}</ArtifactTitle>
          <ArtifactDescription className="truncate">
            {artifact.media_type || 'Media type unavailable'}
            {artifact.size === undefined ? '' : `, ${formatBytes(artifact.size)}`}
          </ArtifactDescription>
        </div>
        <ArtifactActions>
          <ArtifactAction
            icon={CopyIcon}
            label={`Copy URI for ${artifact.name}`}
            onClick={() => void navigator.clipboard.writeText(artifact.uri)}
            tooltip="Copy artifact URI"
          />
          {onOpen ? (
            <Button onClick={() => onOpen(artifact)} size="sm" variant="outline">
              <PanelsTopLeftIcon aria-hidden="true" />
              {contentUnavailable ? 'Inspect details' : 'Open'}
            </Button>
          ) : null}
        </ArtifactActions>
      </ArtifactHeader>
      <ArtifactContent className="p-0">
        {textPreview.data ? (
          <div className="relative max-h-44 overflow-hidden border-t bg-muted/15 px-4 py-3">
            {isMarkdownArtifact(artifact) ? (
              <MessageResponse className="text-sm leading-6">
                {textPreview.data.slice(0, 4_000)}
              </MessageResponse>
            ) : (
              <pre className="overflow-hidden whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
                {textPreview.data.slice(0, 4_000)}
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
                className={cn(image && 'size-full min-h-36 rounded-none bg-muted/40')}
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
            Preview withheld because this image exceeds the {formatBytes(cardPreviewBudget)} card
            budget. Open it for the full view.
          </p>
        ) : null}
        {text && textPreview.isPending && textWithinBudget ? (
          <p className="px-4 py-2 text-xs text-muted-foreground">Loading artifact preview…</p>
        ) : null}
        {text && !textWithinBudget ? (
          <p className="px-4 py-2 text-xs text-muted-foreground">
            Open this artifact to read the full {formatBytes(artifact.size ?? 0)} result.
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

function imageMediaType(path: string): string {
  const extension = path.split('.').at(-1)?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'avif') return 'image/avif';
  return 'image/png';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}
