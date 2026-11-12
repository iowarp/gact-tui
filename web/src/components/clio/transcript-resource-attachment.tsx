import type { MessageBlock, WorkspaceResource } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { DownloadIcon, FolderIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
} from '@/components/ai-elements/attachments';
import { useObjectUrl } from '@/hooks/use-object-url';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { formatBytes } from '@/lib/format';
import { FileTypeIcon } from './file-type-icon';
import { downloadBytes } from './surface-export';
import { useConnectionSettings } from '@/providers/connection-provider';
import { resourceAvailability, resourcePipelineStages } from './resource-availability';
import {
  ResourcePipelineStatusLines,
  ResourcePipelineSummaryIcon,
} from './resource-pipeline-status';

type ResourceBlock = Extract<MessageBlock, { type: 'resource' }>;

export interface TranscriptResourceAttachmentProps {
  block: ResourceBlock;
  relatedResources?: readonly WorkspaceResource[];
  resource?: WorkspaceResource;
  onOpen?: (resource: WorkspaceResource, relatedResources?: readonly WorkspaceResource[]) => void;
}

export interface TranscriptResourceAttachmentsProps {
  blocks: readonly ResourceBlock[];
  resources?: Record<string, WorkspaceResource>;
  onOpen?: (resource: WorkspaceResource, relatedResources?: readonly WorkspaceResource[]) => void;
}

/**
 * A run of adjacent resource blocks as one row of attachment chips above the
 * prompt. The row is only a visual group: each chip keeps its own block identity.
 */
export function TranscriptResourceAttachments({
  blocks,
  resources,
  onOpen,
}: TranscriptResourceAttachmentsProps) {
  const relatedResources = blocks.flatMap((block) => {
    const resource = resources?.[block.resource_id];
    return resource ? [resource] : [];
  });

  return (
    <div
      aria-label={
        blocks.length === 1 ? 'Message attachment' : `${blocks.length} message attachments`
      }
      className="mb-1.5 flex w-full min-w-0 flex-wrap items-end justify-start gap-1.5 group-[.is-user]:justify-end"
      data-slot="message-attachments"
      role="group"
    >
      {blocks.map((block) => (
        <TranscriptResourceAttachmentItem
          block={block}
          key={block.id}
          onOpen={onOpen}
          relatedResources={relatedResources}
          resource={resources?.[block.resource_id]}
        />
      ))}
    </div>
  );
}

function TranscriptResourceAttachmentItem({
  block,
  relatedResources,
  resource,
  onOpen,
}: TranscriptResourceAttachmentProps) {
  const mediaType = resource?.detected_mime || block.media_type;

  if (mediaType?.startsWith('image/')) {
    return (
      <TranscriptImageResourceAttachment
        block={block}
        onOpen={onOpen}
        relatedResources={relatedResources}
        resource={resource}
      />
    );
  }

  return (
    <TranscriptResourceAttachmentDisplay
      block={block}
      onOpen={onOpen}
      relatedResources={relatedResources}
      resource={resource}
      visual={false}
    />
  );
}

function TranscriptImageResourceAttachment({
  block,
  relatedResources,
  resource,
  onOpen,
}: TranscriptResourceAttachmentProps) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const mediaType = resource?.detected_mime || block.media_type || 'image/*';
  const preview = useQuery({
    queryKey: queryKeys.workspaceResourcePreview(
      settings.endpoint,
      resource?.workspace_id ?? block.workspace_id,
      resource?.id ?? block.resource_id,
      resource?.revision,
    ),
    queryFn: ({ signal }) =>
      repository.resourcePreview(
        resource?.workspace_id ?? block.workspace_id,
        resource?.id ?? block.resource_id,
        signal,
      ),
    enabled: resource?.state === 'ready',
  });
  const previewUrl = useObjectUrl(preview.data, mediaType);

  return (
    <TranscriptResourceAttachmentDisplay
      block={block}
      onOpen={onOpen}
      previewUrl={previewUrl}
      relatedResources={relatedResources}
      resource={resource}
      visual
    />
  );
}

function TranscriptResourceAttachmentDisplay({
  block,
  relatedResources,
  resource,
  onOpen,
  previewUrl,
  visual,
}: TranscriptResourceAttachmentProps & { previewUrl?: string; visual: boolean }) {
  const repository = useRepository();
  const [downloading, setDownloading] = useState(false);
  const sourceKind = resource?.connected_source?.kind;
  const folder =
    sourceKind === 'folder' || sourceKind === 'host_folder'
      ? resource?.connected_source
      : undefined;
  const filename = folder?.label ?? resource?.name ?? block.name;
  const mediaType = resource?.detected_mime || block.media_type;
  const availability = resourceAvailability(resource, block.delivery);
  const stages = resourcePipelineStages(resource, availability);
  // A ready attachment needs no status; anything else says what it is waiting on. Until the
  // workspace resource list resolves, the chip shows only its name.
  // A host folder is used in place or copied before the message is sent, so it has no
  // upload, conversion or workspace-copy stages to wait on.
  const pending =
    Boolean(resource) && folder?.kind !== 'host_folder' && stages.overall !== 'complete';

  const open = () => {
    if (resource) onOpen?.(resource, relatedResources);
  };
  const download = async () => {
    if (!resource || downloading) return;
    setDownloading(true);
    try {
      const bytes = await repository.resourceContent(
        resource.workspace_id || block.workspace_id,
        resource.id,
      );
      downloadBytes(bytes, mediaType || 'application/octet-stream', filename);
    } catch (error) {
      toast.error('Could not download attachment', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AttachmentHoverCard closeDelay={100} openDelay={220}>
      <AttachmentHoverCardTrigger asChild>
        {visual ? (
          <span
            className="relative inline-flex size-16 shrink-0 overflow-hidden rounded-[8px] border border-border bg-hover"
            data-file-row
          >
            <button
              aria-label={`Open ${filename}`}
              className="grid size-full place-items-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              disabled={!resource || !onOpen}
              onClick={open}
              title={filename}
              type="button"
            >
              {previewUrl ? (
                <img
                  alt={filename}
                  className="size-full object-cover"
                  height={64}
                  src={previewUrl}
                  width={64}
                />
              ) : (
                <FileTypeIcon className="size-5" mediaType={mediaType} name={filename} />
              )}
            </button>
            {pending ? (
              <span className="pointer-events-none absolute right-1 bottom-1">
                <ResourcePipelineSummaryIcon overlay stages={stages} />
              </span>
            ) : null}
          </span>
        ) : (
          <span
            className="inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-[7px] bg-hover pr-1 pl-2 text-[13px] text-foreground"
            data-file-row
          >
            <button
              aria-label={`Open ${filename}`}
              className="flex min-w-0 items-center gap-1.5 rounded-[5px] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
              disabled={!resource || !onOpen}
              onClick={open}
              type="button"
            >
              {folder ? (
                <FolderIcon
                  aria-label="Folder"
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              ) : (
                <FileTypeIcon className="size-3.5 shrink-0" mediaType={mediaType} name={filename} />
              )}
              <span className="min-w-0 truncate">{filename}</span>
              {resource && !folder ? (
                <span className="shrink-0 text-[11.5px] text-muted-foreground">
                  {formatBytes(resource.received_size)}
                </span>
              ) : null}
            </button>
            {pending ? (
              <span className="flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground">
                <ResourcePipelineSummaryIcon stages={stages} />
                <span aria-hidden="true">{stages.overallLabel}</span>
              </span>
            ) : null}
            {resource?.state === 'ready' && !folder ? (
              <button
                aria-label={`Download ${filename}`}
                className="grid size-[22px] shrink-0 place-items-center rounded-[5px] text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50"
                disabled={downloading}
                onClick={() => void download()}
                title={`Download ${filename}`}
                type="button"
              >
                <DownloadIcon aria-hidden="true" className="size-3.5" />
              </button>
            ) : (
              <span className="w-1" />
            )}
          </span>
        )}
      </AttachmentHoverCardTrigger>
      <AttachmentHoverCardContent className="max-w-72 border bg-popover p-3 shadow-md">
        <p className="truncate text-sm font-medium">{filename}</p>
        {folder?.kind === 'host_folder' ? null : folder ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {folder.linked === 'true' ? 'Linked folder' : 'Downloaded folder'}
          </p>
        ) : mediaType ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{mediaType}</p>
        ) : null}
        {folder?.kind === 'host_folder' ? (
          <>
            <p className="mt-1 max-w-64 text-xs text-foreground">
              {folder.placement === 'in_place'
                ? 'In place. The agent works on your original folder, and its changes affect your files.'
                : 'Full copy. The agent works on its own copy, and your originals stay untouched.'}
            </p>
            <p className="mt-1.5 text-xs break-all text-muted-foreground">
              {hostFolderDetails(folder)}
            </p>
          </>
        ) : (
          <>
            <div className="mt-2">
              <ResourcePipelineStatusLines stages={stages} />
            </div>
            <p className="mt-2 max-w-64 text-xs text-muted-foreground">{availability.detail}</p>
          </>
        )}
      </AttachmentHoverCardContent>
    </AttachmentHoverCard>
  );
}

/** "677 files, 6.8 GB. D:\data\polaris" */
function hostFolderDetails(folder: Record<string, string>): string {
  const files = Number(folder.file_count);
  const bytes = Number(folder.total_bytes);
  const size =
    Number.isFinite(files) && Number.isFinite(bytes)
      ? `${files} ${files === 1 ? 'file' : 'files'}, ${formatBytes(bytes)}. `
      : '';
  return `${size}${folder.path ?? ''}`.trim();
}
