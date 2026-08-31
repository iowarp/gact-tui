import {
  Attachment,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from '@/components/ai-elements/attachments';
import { usePromptInputAttachments } from '@/components/ai-elements/prompt-input';

/** Compact AI Elements attachment tray backed by PromptInput file state. */
export function ClioComposerAttachments() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;

  return (
    <Attachments className="px-2.5 pb-1.5 pt-2" variant="inline">
      {attachments.files.map((file) => (
        <Attachment data={file} key={file.id} onRemove={() => attachments.remove(file.id)}>
          <AttachmentHoverCard>
            <AttachmentHoverCardTrigger asChild>
              <button
                aria-label={`Preview ${file.filename ?? 'attachment'}`}
                className="flex min-w-0 items-center gap-1.5"
                type="button"
              >
                <AttachmentPreview />
                <AttachmentInfo showMediaType />
              </button>
            </AttachmentHoverCardTrigger>
            <AttachmentHoverCardContent>
              {file.mediaType?.startsWith('image/') ? (
                <img
                  alt={file.filename ?? 'Attachment preview'}
                  className="max-h-64 max-w-80 rounded-md object-contain"
                  src={file.url}
                />
              ) : (
                <div className="max-w-72 px-1 py-0.5 text-sm">
                  <p className="truncate font-medium">{file.filename ?? 'Attachment'}</p>
                  <p className="text-xs text-muted-foreground">
                    {file.mediaType || 'Type will be detected by the service'}
                  </p>
                </div>
              )}
            </AttachmentHoverCardContent>
          </AttachmentHoverCard>
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
}
