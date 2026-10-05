import type { ReactNode } from 'react';
import { FileIcon, FolderIcon } from 'lucide-react';
import { Attachment, AttachmentRemove, Attachments } from '@/components/ai-elements/attachments';

export function SourceAttachmentCard({
  id,
  label,
  detail,
  folder = true,
  onOpen,
  onRemove,
  children,
}: {
  id: string;
  label: string;
  detail: string;
  folder?: boolean;
  onOpen?: () => void;
  onRemove: () => void;
  children?: ReactNode;
}) {
  const Icon = folder ? FolderIcon : FileIcon;
  return (
    <Attachments variant="list" className="w-72 max-w-full">
      <Attachment
        data={{ id, type: 'file', filename: label, mediaType: 'application/octet-stream', url: '' }}
        onRemove={onRemove}
        className="gap-2 p-2"
      >
        <Icon aria-hidden="true" className="size-6 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              aria-label={`Open attached ${folder ? 'folder' : 'file'} ${label}`}
              title={label}
              className="block max-w-full truncate text-left text-sm font-medium hover:underline"
            >
              {label}
            </button>
          ) : (
            <p className="truncate text-sm font-medium" title={label}>
              {label}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{detail}</p>
          {children}
        </div>
        <AttachmentRemove aria-label={`Remove attachment ${label}`} />
      </Attachment>
    </Attachments>
  );
}
