import type { MessageBlock, WorkspaceResource } from '@clio/core/v3';
import { CheckCircle2Icon, CircleAlertIcon, LoaderCircleIcon } from 'lucide-react';
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from '@/components/ai-elements/attachments';

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
  const processing = resource?.processing;
  const state = processing?.state ?? 'not_started';
  const filename = resource?.name ?? block.name;
  const mediaType = resource?.detected_mime || block.media_type;
  const status =
    state === 'complete'
      ? 'Converted'
      : state === 'submitted' || state === 'processing'
        ? processing?.progress
          ? `Converting ${processing.progress}%`
          : 'Converting'
        : state === 'failed'
          ? 'Original available'
          : 'Original';
  const StatusIcon =
    state === 'complete'
      ? CheckCircle2Icon
      : state === 'submitted' || state === 'processing'
        ? LoaderCircleIcon
        : state === 'failed'
          ? CircleAlertIcon
          : undefined;

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
        title={`${filename} — ${status}`}
      >
        <AttachmentPreview className="size-6 [&_svg]:size-3.5" />
        <AttachmentInfo className="max-w-56 text-xs" showMediaType />
        <span className="ml-1 inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
          {StatusIcon ? (
            <StatusIcon
              aria-hidden="true"
              className={`size-3 ${state === 'processing' || state === 'submitted' ? 'animate-spin' : ''}`}
            />
          ) : null}
          {status}
        </span>
      </Attachment>
    </Attachments>
  );
}
