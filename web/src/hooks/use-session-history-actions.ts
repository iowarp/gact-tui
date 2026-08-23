import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useRepository } from './use-repository';

/** Authoritative branching and destructive transcript-history mutations for the focused session. */
export function useSessionHistoryActions(sessionId: string, workspaceId: string) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { settings } = useConnectionSettings();

  const refreshFocusedSession = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transcript', settings.endpoint, sessionId] }),
      queryClient.invalidateQueries({ queryKey: ['sessions', settings.endpoint, workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ['sessions', settings.endpoint, 'all'] }),
    ]);
  };

  const fork = useMutation({
    mutationFn: (atMessageId?: string) =>
      repository.forkSession(sessionId, atMessageId ? { at_message_id: atMessageId } : {}),
    onSuccess: async (forked) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspaces', settings.endpoint] }),
        queryClient.invalidateQueries({ queryKey: ['sessions', settings.endpoint, 'all'] }),
        queryClient.invalidateQueries({
          queryKey: ['sessions', settings.endpoint, forked.workspace_id],
        }),
      ]);
      toast.success(`Branched into ${forked.title}`);
      await navigate(
        `/workspaces/${encodeURIComponent(forked.workspace_id)}/sessions/${encodeURIComponent(forked.id)}`,
      );
    },
    onError: (error) =>
      toast.error('Unable to branch this session', { description: error.message }),
  });

  const compact = useMutation({
    mutationFn: () => repository.compactSession(sessionId),
    onSuccess: async (result) => {
      await refreshFocusedSession();
      if (result.compacted) toast.success('Conversation compacted');
      else
        toast.info('Conversation was not compacted', {
          description: result.reason ?? 'The service did not report a reason.',
        });
    },
    onError: (error) =>
      toast.error('Unable to compact this conversation', { description: error.message }),
  });

  const undo = useMutation({
    mutationFn: () => repository.undoSession(sessionId),
    onSuccess: async (result) => {
      await refreshFocusedSession();
      toast.success(
        result.deleted_message_ids.length === 1
          ? 'Last message removed'
          : `${result.deleted_message_ids.length} messages removed`,
      );
    },
    onError: (error) =>
      toast.error('Unable to remove the last message', { description: error.message }),
  });

  const rewind = useMutation({
    mutationFn: (messageId: string) => repository.rewindSession(sessionId, messageId),
    onSuccess: async (result) => {
      await refreshFocusedSession();
      toast.success(
        result.deleted_message_ids.length === 1
          ? 'One later message removed'
          : `${result.deleted_message_ids.length} later messages removed`,
      );
    },
    onError: (error) =>
      toast.error('Unable to rewind this conversation', { description: error.message }),
  });

  const share = useMutation({
    mutationFn: async (ttlSeconds: number) => {
      const result = await repository.shareSession(sessionId, ttlSeconds);
      return { ...result, url: new URL(result.url, settings.endpoint).toString() };
    },
    onError: (error) =>
      toast.error('Unable to create a share link', { description: error.message }),
  });

  return { compact, fork, rewind, share, undo };
}
