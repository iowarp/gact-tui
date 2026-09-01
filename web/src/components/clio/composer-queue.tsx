import type { MessageDelivery, QueuedMessage } from '@clio/core/v3';
import {
  CheckIcon,
  GripVerticalIcon,
  PencilIcon,
  SendIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Queue,
  QueueItem,
  QueueItemAction,
  QueueItemActions,
  QueueItemContent,
  QueueItemFile,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from '@/components/ai-elements/queue';
import { Input } from '@/components/ui/input';

interface ClioComposerQueueProps {
  messages: QueuedMessage[];
  promoteDelivery: MessageDelivery;
  busy?: boolean;
  onDelete: (message: QueuedMessage) => Promise<void>;
  onPromote: (message: QueuedMessage, delivery: MessageDelivery) => Promise<void>;
  onReorder: (messages: QueuedMessage[]) => Promise<void>;
  onUpdate: (message: QueuedMessage, text: string) => Promise<void>;
}

/** Durable queued-message list composed from the AI Elements Queue primitives. */
export function ClioComposerQueue({
  busy,
  messages,
  onDelete,
  onPromote,
  onReorder,
  onUpdate,
  promoteDelivery,
}: ClioComposerQueueProps) {
  const [orderOverride, setOrderOverride] = useState<QueuedMessage[]>();
  const ordered = orderOverride ?? messages;
  const [draggedId, setDraggedId] = useState<string>();
  const [editing, setEditing] = useState<{ id: string; text: string }>();

  const messageById = useMemo(() => new Map(ordered.map((row) => [row.id, row])), [ordered]);
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
    if (!source) return;
    const next = ordered.filter((item) => item.id !== draggedId);
    next.splice(next.findIndex((item) => item.id === targetId), 0, source);
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
    <Queue className="mx-auto mb-2 max-w-4xl">
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
                  {resources.slice(0, 2).map((resource) => (
                    <QueueItemFile key={resource.resource_id}>{resource.name}</QueueItemFile>
                  ))}
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
