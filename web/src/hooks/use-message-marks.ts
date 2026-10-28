import type { Session } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { messageMarkIds } from '@/lib/message-marks';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { useRepository } from './use-repository';

/** Save marks to the service, acknowledging them only after persistence succeeds. */
export function useMessageMarks(session: Session | undefined) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const ids = useMemo(() => messageMarkIds(session?.metadata), [session?.metadata]);
  const mutation = useMutation({
    mutationFn: async ({ messageId, marked }: { messageId: string; marked: boolean }) => {
      if (!session) throw new Error('Open a conversation before marking a message.');
      return repository.updateSession(session.id, { message_marks: { [messageId]: marked } });
    },
    onSuccess: async (updated) => {
      const store = useLiveStore.getState();
      const current = store.entities.sessions[updated.id];
      if (!current || current.updated_at <= updated.updated_at) {
        store.replaceSnapshots({ sessions: { ...store.entities.sessions, [updated.id]: updated } });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.allSessionReads(settings.endpoint) }),
      ]);
    },
    onError: (error) => toast.error('Could not save message mark', { description: error.message }),
  });
  const { mutateAsync } = mutation;
  const onMarkMessage = useCallback(
    async (messageId: string, marked: boolean) => {
      await mutateAsync({ messageId, marked });
    },
    [mutateAsync],
  );
  return {
    markedMessageIds: ids,
    markingMessageId: mutation.isPending ? mutation.variables?.messageId : undefined,
    onMarkMessage,
  };
}
