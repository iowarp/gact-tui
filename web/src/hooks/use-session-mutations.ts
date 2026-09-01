import { queryKeys } from '@/lib/query-keys';
import { invalidateQueriesInBackground } from '@/lib/query-invalidation';
import type {
  ComposerMessagePart,
  MessageBehavior,
  MessageDelivery,
  QueuedMessage,
  Session,
} from '@clio/core/v3';
import type { FileUIPart } from 'ai';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { SessionBehaviorPatch } from '@/components/clio/session-behavior-options';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { useRepository } from './use-repository';
import {
  uploadWorkspaceResources,
  type ResourceUploadProgress,
} from '@/lib/upload-workspace-resources';

interface UseSessionMutationsInput {
  activeModel?: string;
  activeProvider?: string;
  session?: Session;
  sessionId: string;
  workspaceId: string;
}

export interface SessionSendInput {
  text: string;
  files?: FileUIPart[];
  provider?: string;
  model?: string;
  effort?: string;
  delivery: MessageDelivery | 'queued';
  behavior: MessageBehavior;
  onUploadProgress?: (progress: ResourceUploadProgress) => void;
}

interface ActionCardInput {
  id: string;
  label: string;
  enabled: boolean;
  behavior: { kind: string; handle_id?: string; reason?: string };
}

/** Owns session-changing operations and their authoritative query reconciliation. */
export function useSessionMutations({
  activeModel,
  activeProvider,
  session,
  sessionId,
  workspaceId,
}: UseSessionMutationsInput) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const replaceSnapshots = useLiveStore((state) => state.replaceSnapshots);

  const queuedMessages = useQuery({
    enabled: Boolean(sessionId),
    queryFn: ({ signal }) => repository.queuedMessages(sessionId, signal),
    queryKey: queryKeys.queuedMessages(settings.endpoint, sessionId),
  });
  const pendingSteers = useQuery({
    enabled: Boolean(sessionId),
    queryFn: ({ signal }) => repository.pendingSteers(sessionId, signal),
    queryKey: queryKeys.pendingSteers(settings.endpoint, sessionId),
    refetchInterval: session?.state === 'running' ? 1_500 : false,
  });

  const invalidateComposerState = () => {
    invalidateQueriesInBackground(queryClient, [
      queryKeys.queuedMessages(settings.endpoint, sessionId),
      queryKeys.pendingSteers(settings.endpoint, sessionId),
      queryKeys.workspaceResources(settings.endpoint, workspaceId),
      queryKeys.transcript(settings.endpoint, sessionId),
      queryKeys.sessions(settings.endpoint, workspaceId),
    ]);
  };

  const send = useMutation({
    mutationFn: async (value: SessionSendInput) => {
      const provider = value.provider ?? activeProvider;
      const model = value.model ?? activeModel;
      if (!provider || !model) throw new Error('Choose an available provider and model.');

      const uploaded = value.files?.length
        ? await uploadWorkspaceResources({
            files: value.files,
            onProgress: value.onUploadProgress,
            repository,
            workspaceId,
          })
        : { parts: [] as ComposerMessagePart[], resources: [] };
      const text = value.text.trim();
      const parts: ComposerMessagePart[] = [
        ...(text ? [{ text, type: 'text' as const }] : []),
        ...uploaded.parts,
      ];
      if (parts.length === 0) throw new Error('Write a message or attach a resource.');

      const clientMessageId = crypto.randomUUID();
      const idempotencyKey = crypto.randomUUID();
      const route = { model_id: model, provider_id: provider };
      if (value.delivery === 'queued') {
        return repository.createQueuedMessage(sessionId, {
          behavior: value.behavior,
          client_message_id: clientMessageId,
          idempotency_key: idempotencyKey,
          model: route,
          parts,
        });
      }
      return repository.submitMessage(sessionId, {
        behavior: value.behavior,
        client_message_id: clientMessageId,
        delivery: value.delivery,
        idempotency_key: idempotencyKey,
        model: route,
        parts,
      });
    },
    onSettled: invalidateComposerState,
  });

  const updateQueuedMessage = useMutation({
    mutationFn: ({ message, text }: { message: QueuedMessage; text: string }) =>
      repository.updateQueuedMessage(sessionId, message.id, {
        parts: replaceQueuedText(message.parts, text),
        revision: message.revision,
      }),
    onSuccess: invalidateComposerState,
  });

  const deleteQueuedMessage = useMutation({
    mutationFn: (message: QueuedMessage) =>
      repository.deleteQueuedMessage(sessionId, message.id, message.revision),
    onSuccess: invalidateComposerState,
  });

  const promoteQueuedMessage = useMutation({
    mutationFn: ({ delivery, message }: { delivery: MessageDelivery; message: QueuedMessage }) =>
      repository.promoteQueuedMessage(sessionId, message.id, message.revision, delivery),
    onSuccess: invalidateComposerState,
  });

  const reorderQueuedMessages = useMutation({
    mutationFn: (messages: QueuedMessage[]) =>
      repository.reorderQueuedMessages(sessionId, messages),
    onSuccess: (messages) => {
      queryClient.setQueryData(queryKeys.queuedMessages(settings.endpoint, sessionId), messages);
    },
    onSettled: invalidateComposerState,
  });

  const cancelPendingSteer = useMutation({
    mutationFn: (messageId: string) => repository.cancelPendingSteer(sessionId, messageId),
    onSuccess: invalidateComposerState,
  });

  const cancel = useMutation({
    mutationFn: () => repository.cancelSession(sessionId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('transcript', settings.endpoint, sessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('sessions', settings.endpoint, workspaceId),
        }),
      ]);
    },
  });

  const retry = useMutation({
    mutationFn: (messageId: string) =>
      repository.retryTurn(sessionId, messageId, {
        execute: true,
        provider_id: activeProvider,
        model_id: activeModel,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('transcript', settings.endpoint, sessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('sessions', settings.endpoint, workspaceId),
        }),
      ]);
    },
  });

  const updateSessionBehavior = useMutation({
    mutationFn: (patch: SessionBehaviorPatch) => repository.updateSession(sessionId, patch),
    onSuccess: async (updated) => {
      replaceSnapshots({
        sessions: { ...useLiveStore.getState().entities.sessions, [updated.id]: updated },
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.key('sessions', settings.endpoint, workspaceId),
      });
    },
  });

  const respondPermission = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'allow' | 'deny' | 'allow_session' | 'allow_workspace';
    }) => repository.respondPermission(id, action),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('pending-approvals', settings.endpoint),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('sessions', settings.endpoint, workspaceId),
        }),
      ]);
    },
  });

  const answerQuestion = useMutation({
    mutationFn: ({
      id,
      answer,
    }: {
      id: string;
      answer: { answer?: string; selected_options?: string[] };
    }) => repository.answerQuestion(sessionId, id, answer),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('pending-questions', settings.endpoint, sessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('sessions', settings.endpoint, workspaceId),
        }),
      ]);
    },
  });

  const cancelQuestion = useMutation({
    mutationFn: (id: string) => repository.cancelQuestion(sessionId, id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('pending-questions', settings.endpoint, sessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('sessions', settings.endpoint, workspaceId),
        }),
      ]);
    },
  });

  const actionCard = useMutation({
    mutationFn: async (action: ActionCardInput) => {
      if (action.behavior.kind !== 'focus_session' || !action.behavior.handle_id) {
        throw new Error(action.behavior.reason || 'This action is not available.');
      }
      return repository.agentTask(action.behavior.handle_id);
    },
    onSuccess: (task) => {
      void navigate(`/workspaces/${workspaceId}/sessions/${task.child_session_id}`);
    },
  });

  return {
    actionCard,
    answerQuestion,
    cancel,
    cancelQuestion,
    cancelPendingSteer,
    deleteQueuedMessage,
    pendingSteers,
    promoteQueuedMessage,
    queuedMessages,
    reorderQueuedMessages,
    respondPermission,
    retry,
    send,
    updateQueuedMessage,
    updateSessionBehavior,
  };
}

function replaceQueuedText(parts: ComposerMessagePart[], text: string): ComposerMessagePart[] {
  const remaining = parts.filter((part) => part.type !== 'text');
  return text.trim() ? [{ text: text.trim(), type: 'text' }, ...remaining] : remaining;
}
