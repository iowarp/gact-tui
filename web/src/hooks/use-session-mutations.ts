import { queryKeys } from '@/lib/query-keys';
import { invalidateQueriesInBackground } from '@/lib/query-invalidation';
import { ACTIVE_SESSION_POLL_MS } from '@/lib/runtime-limits';
import { SendIdentities, sendFingerprint } from '@/lib/send-identity';
import type {
  ComposerMessagePart,
  MessageBehavior,
  MessageDelivery,
  PendingInteraction,
  PendingInteractionResponse,
  QueuedMessage,
  Session,
  WorkspaceResource,
} from '@clio/core/v3';
import { QueuedMessageReorderConflictError } from '@clio/core/v3';
import type { FileUIPart } from 'ai';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionBehaviorPatch } from '@/components/clio/session-behavior-options';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { useRepository } from './use-repository';
import {
  uploadWorkspaceResources,
  type ResourceUploadProgress,
  type WorkspaceResourceUploadResult,
} from '@/lib/upload-workspace-resources';
import { respondToLegacyInteraction } from '@/lib/pending-interaction-contract';

interface UseSessionMutationsInput {
  activeModel?: string;
  activeProvider?: string;
  session?: Session;
  sessionId: string;
  workspaceId: string;
  interactionRootSessionId?: string;
  supportsUnifiedInteractions?: boolean;
}

export interface SessionSendInput {
  text: string;
  references?: ComposerMessagePart[];
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
  interactionRootSessionId = sessionId,
  supportsUnifiedInteractions = false,
}: UseSessionMutationsInput) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const replaceSnapshots = useLiveStore((state) => state.replaceSnapshots);

  // Uploads outlive a single request: they chunk bytes and then wait for the
  // service to register the resource. Leaving the session must end that wait
  // rather than leave it polling against a session nobody is looking at.
  const uploadController = useRef<AbortController | null>(null);
  const preparedUploads = useRef(new Map<string, Promise<WorkspaceResourceUploadResult>>());
  useEffect(() => {
    const controller = new AbortController();
    uploadController.current = controller;
    const cache = preparedUploads.current;
    const cachePrefix = `${sessionId}\u0000`;
    return () => {
      controller.abort();
      if (uploadController.current === controller) uploadController.current = null;
      for (const key of cache.keys()) {
        if (key.startsWith(cachePrefix)) cache.delete(key);
      }
    };
  }, [sessionId]);

  const queuedMessages = useQuery({
    enabled: Boolean(sessionId),
    queryFn: ({ signal }) => repository.queuedMessages(sessionId, signal),
    queryKey: queryKeys.queuedMessages(settings.endpoint, sessionId),
  });
  const pendingSteers = useQuery({
    enabled: Boolean(sessionId),
    queryFn: ({ signal }) => repository.pendingSteers(sessionId, signal),
    queryKey: queryKeys.pendingSteers(settings.endpoint, sessionId),
    refetchInterval: session?.state === 'running' ? ACTIVE_SESSION_POLL_MS : false,
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

  const prepareFiles = useCallback(
    async (
      files: readonly FileUIPart[],
      onProgress?: (progress: ResourceUploadProgress) => void,
      signal?: AbortSignal,
    ): Promise<WorkspaceResourceUploadResult> => {
      const uploadsForFiles = files.map((file) => {
        const cacheKey = `${sessionId}\u0000${file.url}`;
        let pending = preparedUploads.current.get(cacheKey);
        if (!pending) {
          const controller = uploadController.current;
          if (!controller || controller.signal.aborted) {
            throw new Error('The attachment upload is no longer active for this session.');
          }
          const uploadSignal = signal
            ? AbortSignal.any([controller.signal, signal])
            : controller.signal;
          pending = uploadWorkspaceResources({
            files: [file],
            onProgress,
            repository,
            signal: uploadSignal,
            workspaceId,
          })
            .then((result) => {
              queryClient.setQueryData<WorkspaceResource[]>(
                queryKeys.workspaceResources(settings.endpoint, workspaceId),
                (current = []) => {
                  const byId = new Map(current.map((resource) => [resource.id, resource]));
                  for (const resource of result.resources) byId.set(resource.id, resource);
                  return [...byId.values()];
                },
              );
              void queryClient.invalidateQueries({
                queryKey: queryKeys.workspaceResources(settings.endpoint, workspaceId),
              });
              return result;
            })
            .catch((error: unknown) => {
              preparedUploads.current.delete(cacheKey);
              throw error;
            });
          preparedUploads.current.set(cacheKey, pending);
        }
        return pending;
      });
      const results = await Promise.all(uploadsForFiles);
      return {
        parts: results.flatMap((result) => result.parts),
        resources: results.flatMap((result) => result.resources),
      };
    },
    [queryClient, repository, sessionId, settings.endpoint, workspaceId],
  );

  const sendIdentities = useRef(new SendIdentities());
  const send = useMutation({
    mutationFn: async (value: SessionSendInput) => {
      const provider = value.provider ?? activeProvider;
      const model = value.model ?? activeModel;
      if (!provider || !model) throw new Error('Choose an available provider and model.');
      const identity = sendIdentities.current.forSend(sendFingerprint(value));

      const uploaded = value.files?.length
        ? await prepareFiles(value.files, value.onUploadProgress)
        : { parts: [] as ComposerMessagePart[], resources: [] };
      const text = value.text.trim();
      const parts: ComposerMessagePart[] = [
        ...(text ? [{ text, type: 'text' as const }] : []),
        ...(value.references ?? []),
        ...uploaded.parts,
      ];
      if (parts.length === 0) throw new Error('Write a message or attach a resource.');

      const route = { model_id: model, provider_id: provider };
      if (value.delivery === 'queued') {
        return repository.createQueuedMessage(sessionId, {
          behavior: value.behavior,
          client_message_id: identity.clientMessageId,
          idempotency_key: identity.idempotencyKey,
          model: route,
          parts,
        });
      }
      return repository.submitMessage(sessionId, {
        behavior: value.behavior,
        client_message_id: identity.clientMessageId,
        delivery: value.delivery,
        idempotency_key: identity.idempotencyKey,
        model: route,
        parts,
      });
    },
    onSuccess: () => sendIdentities.current.accepted(),
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
    onError: (error) => {
      // A refused reorder still tells us what the service holds. Show that
      // rather than leaving the surface on an order the service rejected.
      if (!(error instanceof QueuedMessageReorderConflictError)) return;
      queryClient.setQueryData(
        queryKeys.queuedMessages(settings.endpoint, sessionId),
        error.queuedMessages,
      );
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
        // Pending questions are read unscoped now (mirroring pending-approvals),
        // so the invalidation must be the endpoint-level prefix that query is
        // actually keyed under, not a per-session key that would never match it.
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('pending-questions', settings.endpoint),
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
          queryKey: queryKeys.key('pending-questions', settings.endpoint),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('sessions', settings.endpoint, workspaceId),
        }),
      ]);
    },
  });

  const respondInteraction = useMutation({
    mutationFn: ({
      interaction,
      response,
    }: {
      interaction: PendingInteraction;
      response: PendingInteractionResponse;
    }) => {
      if (supportsUnifiedInteractions) {
        return repository.respondInteraction(interactionRootSessionId, interaction.id, response);
      }
      return respondToLegacyInteraction(interaction, response, {
        answerQuestion: (ownerSessionId, questionId, answer) =>
          repository.answerQuestion(ownerSessionId, questionId, answer),
        cancelQuestion: (ownerSessionId, questionId) =>
          repository.cancelQuestion(ownerSessionId, questionId),
        respondPermission: (permissionId, action) =>
          repository.respondPermission(permissionId, action),
        a2uiAction: (ownerSessionId, message, correlation) =>
          repository.a2uiAction(ownerSessionId, message, correlation),
      });
    },
    onSettled: async (_result, _error, { interaction }) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.pendingInteractions(settings.endpoint, interactionRootSessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.pendingApprovals(settings.endpoint),
        }),
        // Pending questions are read unscoped (`?status=pending`, no session_id) at
        // the 'all-active' key, same as pending-approvals — the per-session key
        // this used to invalidate never matches that query, so it never refetches.
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('pending-questions', settings.endpoint),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.sessions(settings.endpoint, workspaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.sessions(settings.endpoint, 'all'),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.transcript(
            settings.endpoint,
            interaction.owner_session_id,
            'pending-a2ui',
          ),
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
    prepareFiles,
    queuedMessages,
    reorderQueuedMessages,
    respondInteraction,
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
