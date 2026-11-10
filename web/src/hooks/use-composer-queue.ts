import type {
  ComposerMessagePart,
  MessageBehavior,
  MessageDelivery,
  QueuedMessage,
} from '@clio/core/v3';
import { QueuedMessageReorderConflictError } from '@clio/core/v3';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { invalidateQueriesInBackground } from '@/lib/query-invalidation';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useRepository } from './use-repository';

/**
 * The session's queued messages and the edits made to them from the composer.
 *
 * Owned by the composer rather than the page: the queue's reads and pending
 * states re-render only the message box, and editing, deleting or reordering a
 * queued message leaves the transcript alone. Only promoting one changes the
 * conversation, so only that refreshes it.
 */
export function useComposerQueue({
  sessionId,
  workspaceId,
  reconcileTurnMode,
}: {
  sessionId: string;
  workspaceId: string;
  /** Moves the session to a message's mode before it starts a turn. */
  reconcileTurnMode: (behavior: MessageBehavior) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const queueKey = queryKeys.queuedMessages(settings.endpoint, sessionId);

  const queuedMessages = useQuery({
    enabled: Boolean(sessionId),
    queryFn: ({ signal }) => repository.queuedMessages(sessionId, signal),
    queryKey: queueKey,
    notifyOnChangeProps: ['data'],
  });
  const adding =
    useIsMutating({ mutationKey: queryKeys.queueSend(settings.endpoint, sessionId) }) > 0;

  const invalidateQueue = () =>
    invalidateQueriesInBackground(queryClient, [
      queueKey,
      queryKeys.allSessionReads(settings.endpoint),
    ]);

  const updateQueuedMessage = useMutation({
    mutationFn: ({ message, text }: { message: QueuedMessage; text: string }) =>
      repository.updateQueuedMessage(sessionId, message.id, {
        parts: replaceQueuedText(message.parts, text),
        revision: message.revision,
      }),
    onSuccess: invalidateQueue,
  });

  const deleteQueuedMessage = useMutation({
    mutationFn: (message: QueuedMessage) =>
      repository.deleteQueuedMessage(sessionId, message.id, message.revision),
    onSuccess: invalidateQueue,
  });

  const promoteQueuedMessage = useMutation({
    mutationFn: async ({
      delivery,
      message,
    }: {
      delivery: MessageDelivery;
      message: QueuedMessage;
    }) => {
      if (delivery === 'start') await reconcileTurnMode(message.behavior);
      return repository.promoteQueuedMessage(sessionId, message.id, message.revision, delivery);
    },
    onSuccess: () =>
      invalidateQueriesInBackground(queryClient, [
        queueKey,
        queryKeys.pendingSteers(settings.endpoint, sessionId),
        queryKeys.workspaceResources(settings.endpoint, workspaceId),
        queryKeys.transcript(settings.endpoint, sessionId),
        queryKeys.allSessionReads(settings.endpoint),
      ]),
  });

  const reorderQueuedMessages = useMutation({
    mutationFn: (messages: QueuedMessage[]) =>
      repository.reorderQueuedMessages(sessionId, messages),
    onSuccess: (messages) => {
      queryClient.setQueryData(queueKey, messages);
    },
    onError: (error) => {
      // A refused reorder still tells us what the service holds. Show that
      // rather than leaving the surface on an order the service rejected.
      if (!(error instanceof QueuedMessageReorderConflictError)) return;
      queryClient.setQueryData(queueKey, error.queuedMessages);
    },
    onSettled: invalidateQueue,
  });

  return {
    /** A message is on its way into the queue (see `useSessionMutations().sendMessage`). */
    adding,
    busy:
      deleteQueuedMessage.isPending ||
      promoteQueuedMessage.isPending ||
      reorderQueuedMessages.isPending ||
      updateQueuedMessage.isPending,
    deleteQueuedMessage,
    messages: queuedMessages.data,
    promoteQueuedMessage,
    reorderQueuedMessages,
    updateQueuedMessage,
  };
}

function replaceQueuedText(parts: ComposerMessagePart[], text: string): ComposerMessagePart[] {
  const remaining = parts.filter((part) => part.type !== 'text');
  return text.trim() ? [{ text: text.trim(), type: 'text' }, ...remaining] : remaining;
}
