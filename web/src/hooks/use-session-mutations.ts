import { queryKeys } from '@/lib/query-keys';
import type { LanguageModelConfiguration, Session } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { SessionBehaviorPatch } from '@/components/clio/session-behavior-options';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { useRepository } from './use-repository';

interface UseSessionMutationsInput {
  activeModel?: string;
  activeProvider?: string;
  modelConfiguration?: LanguageModelConfiguration;
  session?: Session;
  sessionId: string;
  workspaceId: string;
}

export interface SessionSendInput {
  text: string;
  provider?: string;
  model?: string;
  effort?: string;
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
  modelConfiguration,
  session,
  sessionId,
  workspaceId,
}: UseSessionMutationsInput) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const replaceSnapshots = useLiveStore((state) => state.replaceSnapshots);

  const send = useMutation({
    mutationFn: async (value: SessionSendInput) => {
      const selectedPreset = modelConfiguration?.presets.find(
        (preset) => preset.id === value.provider || preset.provider === value.provider,
      );
      const provider = selectedPreset?.provider ?? value.provider;
      const model = value.model;
      const effort = isThinkingLevel(value.effort) ? value.effort : undefined;

      if (
        provider &&
        model &&
        (!modelConfiguration ||
          modelConfiguration.provider !== provider ||
          modelConfiguration.model !== model ||
          (effort !== undefined && modelConfiguration.thinking_level !== effort))
      ) {
        if (!selectedPreset) {
          throw new Error(`The connected service did not report configuration for ${provider}.`);
        }
        if (!selectedPreset.is_authenticated) {
          throw new Error(
            selectedPreset.status_message || `${selectedPreset.label} is not connected.`,
          );
        }
        const nextConfiguration = await repository.updateLanguageModelConfiguration({
          provider: selectedPreset.provider,
          api_base: selectedPreset.api_base ?? '',
          model,
          thinking_level: effort,
        });
        queryClient.setQueryData(
          queryKeys.key('language-model-configuration', settings.endpoint),
          nextConfiguration,
        );
      }

      if (
        provider &&
        model &&
        session &&
        (session.provider_id !== provider || session.model_id !== model)
      ) {
        const updatedSession = await repository.updateSession(sessionId, {
          provider_id: provider,
          model_id: model,
        });
        queryClient.setQueryData<Session[]>(
          ['sessions', settings.endpoint, workspaceId],
          (current) =>
            current?.map((item) => (item.id === updatedSession.id ? updatedSession : item)),
        );
      }

      return repository.sendMessage(sessionId, value.text, {
        provider_id: provider,
        model_id: model,
        effort,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('transcript', settings.endpoint, sessionId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('sessions', settings.endpoint, workspaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('sessions', settings.endpoint, 'all'),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('capabilities', settings.endpoint),
        }),
      ]);
    },
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
    respondPermission,
    retry,
    send,
    updateSessionBehavior,
  };
}

function isThinkingLevel(value?: string): value is 'off' | 'low' | 'medium' | 'high' {
  return value === 'off' || value === 'low' || value === 'medium' || value === 'high';
}
