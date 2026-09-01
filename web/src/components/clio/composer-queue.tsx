import type {
  ComposerMessagePart,
  MessageDelivery,
  QueuedMessage,
  WorkspaceResource,
} from '@clio/core/v3';
import { CheckIcon, GripVerticalIcon, PencilIcon, SendIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Attachment,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
} from '@/components/ai-elements/attachments';
import {
  Queue,
  QueueItem,
  QueueItemAction,
  QueueItemActions,
  QueueItemContent,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from '@/components/ai-elements/queue';
import { Input } from '@/components/ui/input';
import { resourceAvailability, resourcePipelineStages } from './resource-availability';
import {
  ResourcePipelineStatusLines,
  ResourcePipelineSummaryIcon,
} from './resource-pipeline-status';

interface ClioComposerQueueProps {
  messages: QueuedMessage[];
  resources?: readonly WorkspaceResource[];
  promoteDelivery: MessageDelivery;
  busy?: boolean;
  onDelete: (message: QueuedMessage) => Promise<void>;
  onPromote: (message: QueuedMessage, delivery: MessageDelivery) => Promise<void>;
  onOpenResource?: (resource: WorkspaceResource) => void;
  onReorder: (messages: QueuedMessage[]) => Promise<void>;
  onUpdate: (message: QueuedMessage, text: string) => Promise<void>;
}

/** Durable queued-message list composed from the AI Elements Queue primitives. */
export function ClioComposerQueue({
  busy,
  messages,
  onDelete,
  onOpenResource,
  onPromote,
  onReorder,
  onUpdate,
  promoteDelivery,
  resources = [],
}: ClioComposerQueueProps) {
  const [orderOverride, setOrderOverride] = useState<QueuedMessage[]>();
  const ordered = orderOverride ?? messages;
  const [draggedId, setDraggedId] = useState<string>();
  const [editing, setEditing] = useState<{ id: string; text: string }>();

  const messageById = useMemo(() => new Map(ordered.map((row) => [row.id, row])), [ordered]);
  const resourceById = useMemo(
    () => new Map(resources.map((resource) => [resource.id, resource])),
    [resources],
  );
  if (ordered.length === 0) return null;

  const saveEdit = async (message: QueuedMessage, text: string) => {
    try {
      await onUpdate(message, text);
      setEditing(undefined);
    } catch (error) {
      toast.error('Queued message changed elsewhere', {
        description:
          error instanceof Error
            ? `${error.message} Your draft is still here.`
            : 'Your draft is still here. Review the service version and try again.',
      });
    }
  };

  const runAction = async (action: () => Promise<void>, label: string) => {
    try {
      await action();
    } catch (error) {
      toast.error(label, {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const move = async (messageId: string, offset: -1 | 1) => {
    const index = ordered.findIndex((item) => item.id === messageId);
    const destination = index + offset;
    if (index < 0 || destination < 0 || destination >= ordered.length) return;
    const next = [...ordered];
    [next[index], next[destination]] = [next[destination], next[index]];
    setOrderOverride(next);
    try {
      await onReorder(next);
      setOrderOverride(undefined);
    } catch (error) {
      setOrderOverride(undefined);
      toast.error('Queued messages changed elsewhere', {
        description: error instanceof Error ? error.message : 'Reloaded the service order.',
      });
    }
  };

  const dropBefore = async (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const source = messageById.get(draggedId);
    const targetIndex = ordered.findIndex((item) => item.id === targetId);
    if (!source || targetIndex < 0) {
      setDraggedId(undefined);
      return;
    }
    const next = ordered.filter((item) => item.id !== draggedId);
    next.splice(
      next.findIndex((item) => item.id === targetId),
      0,
      source,
    );
    setDraggedId(undefined);
    setOrderOverride(next);
    try {
      await onReorder(next);
      setOrderOverride(undefined);
    } catch (error) {
      setOrderOverride(undefined);
      toast.error('Unable to reorder queued messages', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <Queue
      aria-label="Queued messages"
      className="relative z-10 mx-auto -mb-px w-[calc(100%_-_1.5rem)] max-w-[54.5rem] rounded-b-none border-b-0 py-1"
    >
      <QueueSection>
        <QueueSectionTrigger>
          <QueueSectionLabel count={ordered.length} label="queued messages" />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            {ordered.map((message) => {
              const text = message.parts.find((part) => part.type === 'text')?.text ?? '';
              const resources = message.parts.filter((part) => part.type === 'resource_ref');
              const isEditing = editing?.id === message.id;
              return (
                <QueueItem
                  key={message.id}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => void dropBefore(message.id)}
                >
                  <QueueItemAction
                    aria-label="Reorder queued message"
                    className="cursor-grab active:cursor-grabbing"
                    draggable
                    onDragEnd={() => setDraggedId(undefined)}
                    onDragStart={() => setDraggedId(message.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        void move(message.id, -1);
                      }
                      if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        void move(message.id, 1);
                      }
                    }}
                    tooltip="Reorder queued message"
                  >
                    <GripVerticalIcon />
                  </QueueItemAction>
                  {isEditing ? (
                    <Input
                      aria-label="Edit queued message"
                      autoFocus
                      className="h-7 min-w-0 flex-1"
                      onChange={(event) =>
                        setEditing({ id: message.id, text: event.currentTarget.value })
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setEditing(undefined);
                        if (event.key === 'Enter' && editing.text.trim()) {
                          void saveEdit(message, editing.text);
                        }
                      }}
                      value={editing.text}
                    />
                  ) : (
                    <QueueItemContent title={text}>{text || 'Attachments only'}</QueueItemContent>
                  )}
                  {resources.length > 0 ? (
                    <Attachments className="shrink-0 flex-nowrap gap-1" variant="inline">
                      {resources.slice(0, 2).map((resourceRef) => (
                        <QueuedResourceAttachment
                          key={resourceRef.resource_id}
                          onOpen={onOpenResource}
                          resource={resourceById.get(resourceRef.resource_id)}
                          resourceRef={resourceRef}
                        />
                      ))}
                      {resources.length > 2 ? (
                        <span
                          aria-label={`${resources.length - 2} more attachments`}
                          className="inline-flex h-8 shrink-0 items-center rounded-md border border-border px-1.5 text-xs font-medium text-muted-foreground"
                          title={resources
                            .slice(2)
                            .map((resource) => resource.name)
                            .join(', ')}
                        >
                          +{resources.length - 2}
                        </span>
                      ) : null}
                    </Attachments>
                  ) : null}
                  <QueueItemActions>
                    {isEditing ? (
                      <>
                        <QueueItemAction
                          aria-label="Save queued message"
                          disabled={busy || !editing.text.trim()}
                          onClick={() => void saveEdit(message, editing.text)}
                          tooltip="Save queued message"
                        >
                          <CheckIcon />
                        </QueueItemAction>
                        <QueueItemAction
                          aria-label="Cancel editing queued message"
                          onClick={() => setEditing(undefined)}
                          tooltip="Cancel editing"
                        >
                          <XIcon />
                        </QueueItemAction>
                      </>
                    ) : (
                      <>
                        <QueueItemAction
                          aria-label="Edit queued message"
                          disabled={busy}
                          onClick={() => setEditing({ id: message.id, text })}
                          tooltip="Edit queued message"
                        >
                          <PencilIcon />
                        </QueueItemAction>
                        <QueueItemAction
                          aria-label="Delete queued message"
                          disabled={busy}
                          onClick={() =>
                            void runAction(
                              () => onDelete(message),
                              'Queued message was not deleted',
                            )
                          }
                          tooltip="Delete queued message"
                        >
                          <Trash2Icon />
                        </QueueItemAction>
                        <QueueItemAction
                          aria-label="Send queued message now"
                          disabled={busy}
                          onClick={() =>
                            void runAction(
                              () => onPromote(message, promoteDelivery),
                              'Queued message was not sent',
                            )
                          }
                          tooltip="Send queued message now"
                        >
                          <SendIcon />
                        </QueueItemAction>
                      </>
                    )}
                  </QueueItemActions>
                </QueueItem>
              );
            })}
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  );
}

function QueuedResourceAttachment({
  onOpen,
  resource,
  resourceRef,
}: {
  onOpen?: (resource: WorkspaceResource) => void;
  resource?: WorkspaceResource;
  resourceRef: Extract<ComposerMessagePart, { type: 'resource_ref' }>;
}) {
  const filename = resource?.name ?? resourceRef.name;
  const mediaType = resource?.detected_mime || resource?.claimed_mime || '';
  const availability = resourceAvailability(resource);
  const stages = resourcePipelineStages(resource, availability.label);
  const activate = () => {
    if (resource) onOpen?.(resource);
  };

  return (
    <AttachmentHoverCard closeDelay={100} openDelay={220}>
      <AttachmentHoverCardTrigger asChild>
        <Attachment
          aria-label={resource && onOpen ? `Open ${filename}` : filename}
          className="h-7 max-w-36 gap-1 px-1.5 text-xs focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
          data={{ filename, id: resourceRef.resource_id, mediaType, type: 'file', url: '' }}
          onClick={activate}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            activate();
          }}
          role={resource && onOpen ? 'button' : undefined}
          tabIndex={resource && onOpen ? 0 : undefined}
        >
          <AttachmentPreview className="size-4 [&_svg]:size-3" />
          <AttachmentInfo className="max-w-20" />
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
  );
}
