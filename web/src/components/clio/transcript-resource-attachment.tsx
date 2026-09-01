import type { MessageBlock, WorkspaceResource } from '@clio/core/v3';
import { ActivityIcon } from 'lucide-react';
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from '@/components/ai-elements/attachments';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
  const availability = resourceAvailability(resource);

  const open = () => {
    if (resource) onOpen?.(resource);
  };

  return (
    <Attachments aria-label="Message attachments" className="mb-2 justify-start" variant="inline">
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
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                aria-label={`Attachment status: ${availability.label}`}
                className="ml-1 inline-flex shrink-0 items-center"
                role="img"
              >
                <ActivityIcon aria-hidden="true" className={`size-3.5 ${availability.className}`} />
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-72">{availability.detail}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </Attachment>
    </Attachments>
  );
}

function resourceAvailability(resource?: WorkspaceResource): {
  className: string;
  detail: string;
  label: string;
} {
  if (!resource) {
    return {
      className: 'text-muted-foreground',
      detail: 'Availability could not be verified for this historical attachment.',
      label: 'Unknown',
    };
  }
  if (resource.state === 'uploading') {
    return {
      className: 'text-amber-600 dark:text-amber-400',
      detail: 'The attachment is still uploading and is not available to the agent yet.',
      label: 'Preparing',
    };
  }
  if (resource.state === 'failed' || resource.state === 'quarantined') {
    return {
      className: 'text-destructive',
      detail:
        resource.failure ||
        (resource.state === 'quarantined'
          ? 'The attachment was quarantined and is not available to the agent.'
          : 'The attachment is not available to the agent.'),
      label: 'Unavailable',
    };
  }

  const processing = resource.processing;
  if (
    processing &&
    (processing.state === 'submitted' || processing.state === 'processing') &&
    !processing.derivatives_available
  ) {
    return {
      className: 'text-amber-600 dark:text-amber-400',
      detail: processing.progress
        ? `The original is retained; structured content is ${processing.progress}% ready for the agent.`
        : 'The original is retained; structured content is still being prepared for the agent.',
      label: 'Preparing',
    };
  }

  let detail = 'The original attachment is available to the agent.';
  if (processing?.derivatives_available) {
    detail =
      processing.state === 'cancelled'
        ? 'Ready; the agent can reuse a previously converted derivative. The latest refresh was cancelled.'
        : processing.state === 'failed'
          ? 'Ready; the agent can reuse a previously converted derivative. The latest refresh failed.'
          : processing.state === 'submitted' || processing.state === 'processing'
            ? 'Ready; the agent can reuse a previously converted derivative while a refresh runs.'
            : 'Ready; converted content is available to the agent.';
  }
  return { className: 'text-emerald-600 dark:text-emerald-400', detail, label: 'Ready' };
}
