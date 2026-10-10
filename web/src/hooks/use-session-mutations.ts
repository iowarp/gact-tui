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
  SubagentRun,
  WorkspaceResource,
} from '@clio/core/v3';
import { QueuedMessageReorderConflictError } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  SESSION_MODE_PATCHES,
  type SessionBehaviorPatch,
} from '@/components/clio/session-behavior-options';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { useRepository } from './use-repository';
import { useActionCard } from './use-action-card';
import {
  uploadWorkspaceResources,
  type ResourceUploadProgress,
  type UploadableFilePart,
  type WorkspaceResourceUploadResult,
} from '@/lib/upload-workspace-resources';
import { respondToLegacyInteraction } from '@/lib/pending-interaction-contract';
import { rememberWorkspaceRoute } from '@/lib/workspace-route-memory';
import { firstMessageMetadata } from '@/lib/a2ui/first-message-metadata';

interface UseSessionMutationsInput {
  openSubagent?: (subagent: SubagentRun, target: 'canvas') => void;
  activeModel?: string;
  activeProvider?: string;
  session?: Session;
  sessionId: string;
  workspaceId: string;
  /** A presentation-only entry composer materializes a session on first send. */
  createOnSend?: boolean;
  interactionRootSessionId?: string;
  supportsUnifiedInteractions?: boolean;
}

export interface SessionSendInput {
  text: string;
  references?: ComposerMessagePart[];
  files?: UploadableFilePart[];
  provider?: string;
  model?: string;
  delivery: MessageDelivery | 'queued';
  behavior: MessageBehavior;
  onUploadProgress?: (progress: ResourceUploadProgress) => void;
  /** The pending agent question this message answers (its attachments included). */
  answersQuestionId?: string;
}

function sessionModeForExecution(
  executionMode: MessageBehavior['execution_mode'],
): Exclude<Session['mode'], 'unknown'> {
  if (executionMode === 'plan') return 'plan';
  if (executionMode === 'deep_research') return 'architect';
  return 'edit';
}

/** Owns session-changing operations and their authoritative query reconciliation. */
export function useSessionMutations({
  openSubagent,
  activeModel,
  activeProvider,
  session,
  sessionId,
  workspaceId,
  createOnSend = false,
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
  const draftSession = useRef<Promise<Session> | null>(null);
  const draftUploads = useRef(new Map<string, string>());
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
      queryKeys.sessions(settings.endpoint, 'all'),
    ]);
  };

  const prepareFiles = useCallback(
    async (
      files: readonly UploadableFilePart[],
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
          let uploadId = draftUploads.current.get(cacheKey);
          if (!uploadId) {
            uploadId = `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            draftUploads.current.set(cacheKey, uploadId);
          }
          pending = uploadWorkspaceResources({
            files: [{ ...file, clientUploadId: uploadId, pendingAttachment: true }],
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

  const discardFiles = useCallback(
    async (files: readonly UploadableFilePart[]) => {
      for (const file of files) {
        const key = `${sessionId}\u0000${file.url}`;
        const uploadId = draftUploads.current.get(key);
        if (!uploadId) continue;
        await repository.discardResourceUpload(workspaceId, uploadId);
        preparedUploads.current.delete(key);
        draftUploads.current.delete(key);
      }
      await queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey.includes('workspace-resources') ||
          query.queryKey.includes('workspace-files'),
      });
    },
    [queryClient, repository, sessionId, workspaceId],
  );

  const sendIdentities = useRef(new SendIdentities());
  const reconcileTurnMode = async (behavior: MessageBehavior, target = session) => {
    if (!target) return;
    const mode = sessionModeForExecution(behavior.execution_mode);
    const patch = SESSION_MODE_PATCHES[mode];
    if (
      target.mode === patch.mode &&
      (patch.routing_mode === undefined || target.routing_mode === patch.routing_mode)
    ) {
      return;
    }
    const updated = await repository.updateSession(target.id, patch);
    replaceSnapshots({
      sessions: { ...useLiveStore.getState().entities.sessions, [updated.id]: updated },
    });
  };
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
      const controller = uploadController.current;
      let target = session;
      if (!sessionId && createOnSend) {
        if (!controller || controller.signal.aborted)
          throw new Error('This draft is no longer open.');
        // Retain a successful creation across failed sends/retries. Concurrent
        // submits share the same creation rather than minting extra sessions.
        draftSession.current ??= repository
          .createSession({
            workspace_id: workspaceId,
            title: 'New conversation',
            mode: sessionModeForExecution(value.behavior.execution_mode),
            routing_mode: value.behavior.execution_mode === 'deep_research' ? 'experts' : 'auto',
            approval_mode: value.behavior.confirmation_policy,
          })
          .catch((error: unknown) => {
            draftSession.current = null;
            throw error;
          });
        target = await draftSession.current;
      }
      const targetId = sessionId || target?.id;
      if (!targetId) throw new Error('Open a conversation before sending.');
      if (value.delivery === 'queued') {
        const result = await repository.createQueuedMessage(targetId, {
          behavior: value.behavior,
          client_message_id: identity.clientMessageId,
          idempotency_key: identity.idempotencyKey,
          model: route,
          parts,
          ...(value.answersQuestionId
            ? { metadata: { answers_question_id: value.answersQuestionId } }
            : {}),
        });
        if (!sessionId && target) openStartedSession(target, controller);
        return result;
      }
      if (value.delivery === 'start') await reconcileTurnMode(value.behavior, target);
      const initialMetadata = !sessionId
        ? await firstMessageMetadata(repository, queryClient, targetId)
        : undefined;
      const result = await repository.submitMessage(targetId, {
        behavior: value.behavior,
        client_message_id: identity.clientMessageId,
        delivery: value.delivery,
        idempotency_key: identity.idempotencyKey,
        model: route,
        parts,
        ...(initialMetadata || value.answersQuestionId
          ? {
              metadata: {
                ...initialMetadata,
                ...(value.answersQuestionId
                  ? { answers_question_id: value.answersQuestionId }
                  : {}),
              },
            }
          : {}),
      });
      if (!sessionId && target) openStartedSession(target, controller);
      return result;
    },
    onSuccess: () => sendIdentities.current.accepted(),
    onSettled: (_result, _error, value) => {
      invalidateComposerState();
      if (value.answersQuestionId) {
        invalidateQueriesInBackground(queryClient, [
          queryKeys.pendingInteractions(settings.endpoint, interactionRootSessionId),
          queryKeys.key('pending-questions', settings.endpoint),
        ]);
      }
    },
  });

  function openStartedSession(created: Session, controller: AbortController | null) {
    for (const scope of [workspaceId, 'all']) {
      queryClient.setQueryData<Session[]>(
        queryKeys.sessions(settings.endpoint, scope),
        (current = []) => [...current.filter((item) => item.id !== created.id), created],
      );
    }
    // A submitted turn may finish after navigation. Preserve its real session,
    // but never pull the person back from Settings or another conversation.
    if (!controller || controller.signal.aborted) return;
    rememberWorkspaceRoute(settings.endpoint, workspaceId, created.id);
    void navigate(
      `/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(created.id)}`,
      { replace: true },
    );
  }

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
    onSuccess: invalidateComposerState,
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

  const actionCard = useActionCard(sessionId, workspaceId, openSubagent);

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
    discardFiles,
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
