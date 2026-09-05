import type { MessageBlock, WorkspaceResource } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import {
  Attachment,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from '@/components/ai-elements/attachments';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useObjectUrl } from '@/hooks/use-object-url';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import { resourceAvailability, resourcePipelineStages } from './resource-availability';
import {
  ResourcePipelineStatusLines,
  ResourcePipelineSummaryIcon,
} from './resource-pipeline-status';

type ResourceBlock = Extract<MessageBlock, { type: 'resource' }>;

export interface TranscriptResourceAttachmentProps {
  block: ResourceBlock;
  resource?: WorkspaceResource;
  onOpen?: (resource: WorkspaceResource) => void;
}

export interface TranscriptResourceAttachmentsProps {
  blocks: readonly ResourceBlock[];
  resources?: Record<string, WorkspaceResource>;
  onOpen?: (resource: WorkspaceResource) => void;
}

/**
 * A run of adjacent resource blocks as one attachment grid, mirroring how
 * adjacent artifact blocks group. The grid is only a visual group: each tile
 * keeps its own block identity and its position in the transcript.
 */
export function TranscriptResourceAttachments({
  blocks,
  resources,
  onOpen,
}: TranscriptResourceAttachmentsProps) {
  return (
    <ScrollArea className="mb-2 w-full max-w-full" type="auto">
      <Attachments
        aria-label={
          blocks.length === 1 ? 'Message attachment' : `${blocks.length} message attachments`
        }
        className="justify-start pb-2"
        role="group"
        variant="composer"
      >
        {blocks.map((block) => (
          <TranscriptResourceAttachmentItem
            block={block}
            key={block.id}
            onOpen={onOpen}
            resource={resources?.[block.resource_id]}
          />
        ))}
      </Attachments>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

/** Human-message attachment marker backed by the shared AI Elements primitive. */
export function TranscriptResourceAttachment({
  block,
  resource,
  onOpen,
}: TranscriptResourceAttachmentProps) {
  return (
    <TranscriptResourceAttachments
      blocks={[block]}
      onOpen={onOpen}
      resources={resource ? { [block.resource_id]: resource } : undefined}
    />
  );
}

function TranscriptResourceAttachmentItem({
  block,
  resource,
  onOpen,
}: TranscriptResourceAttachmentProps) {
  const filename = resource?.name ?? block.name;
  const mediaType = resource?.detected_mime || block.media_type;
  const availability = resourceAvailability(resource, block.delivery);
  const stages = resourcePipelineStages(resource, availability);
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const visual = mediaType?.startsWith('image/') ?? false;
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
    enabled: visual && resource?.state === 'ready',
  });
  const previewUrl = useObjectUrl(preview.data, mediaType || 'application/octet-stream');

  const open = () => {
    if (resource) onOpen?.(resource);
  };

  return (
    <AttachmentHoverCard closeDelay={100} openDelay={220}>
      <AttachmentHoverCardTrigger asChild>
        <Attachment
          data={{ filename, id: block.id, mediaType, type: 'file', url: previewUrl ?? '' }}
          title={filename}
        >
          <button
            aria-label={`Open ${filename}`}
            className={cn(
              'text-left',
              visual ? 'size-full' : 'flex min-w-0 flex-1 items-center gap-2 overflow-hidden',
            )}
            disabled={!resource || !onOpen}
            onClick={open}
            type="button"
          >
            <AttachmentPreview />
            <AttachmentInfo className="text-xs" showMediaType />
            <span
              className={cn(
                'shrink-0',
                visual &&
                  'absolute right-2 bottom-2 rounded-full bg-background/85 p-1 shadow-sm backdrop-blur-sm',
              )}
            >
              <ResourcePipelineSummaryIcon stages={stages} />
            </span>
          </button>
        </Attachment>
      </AttachmentHoverCardTrigger>
      <AttachmentHoverCardContent className="max-w-72 border bg-popover p-3 shadow-md">
        <p className="truncate text-sm font-medium">{filename}</p>
        {mediaType ? <p className="mt-0.5 text-xs text-muted-foreground">{mediaType}</p> : null}
        <div className="mt-2">
          <ResourcePipelineStatusLines stages={stages} />
        </div>
        <p className="mt-2 max-w-64 text-xs text-muted-foreground">{availability.detail}</p>
      </AttachmentHoverCardContent>
    </AttachmentHoverCard>
  );
}
