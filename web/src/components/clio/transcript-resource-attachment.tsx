import type { MessageBlock, WorkspaceResource } from '@clio/core/v3';
import {
  Attachment,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from '@/components/ai-elements/attachments';
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

/** Human-message attachment marker backed by the shared AI Elements primitive. */
export function TranscriptResourceAttachment({
  block,
  resource,
  onOpen,
}: TranscriptResourceAttachmentProps) {
  const filename = resource?.name ?? block.name;
  const mediaType = resource?.detected_mime || block.media_type;
  const availability = resourceAvailability(resource, block.delivery);
  const stages = resourcePipelineStages(resource, availability.label);

  const open = () => {
    if (resource) onOpen?.(resource);
  };

  return (
    <Attachments aria-label="Message attachments" className="mb-2 justify-start" variant="inline">
      <AttachmentHoverCard closeDelay={100} openDelay={220}>
        <AttachmentHoverCardTrigger asChild>
          <Attachment
            aria-label={`Open ${filename}`}
            className="h-9 max-w-full gap-2 pr-2"
            data={{ filename, id: block.id, mediaType, type: 'file', url: '' }}
            onClick={open}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              open();
            }}
            role={resource && onOpen ? 'button' : undefined}
            tabIndex={resource && onOpen ? 0 : undefined}
            title={filename}
          >
            <AttachmentPreview className="size-6 [&_svg]:size-3.5" />
            <AttachmentInfo className="max-w-56 text-xs" showMediaType />
            <ResourcePipelineSummaryIcon stages={stages} />
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
    </Attachments>
  );
}
