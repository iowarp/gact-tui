import type { Artifact, Message, RunState, SessionDiff, SubagentRun } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon } from 'lucide-react';
import { AnimatePresence, LayoutGroup, m } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ClioAppShell } from '@/components/clio/app-shell';
import { ClioCommandMenu } from '@/components/clio/command-menu';
import { ClioComposer } from '@/components/clio/composer';
import { ClioConversation } from '@/components/clio/conversation';
import { ClioConversationWelcome } from '@/components/clio/conversation-welcome';
import { ClioNavigation } from '@/components/clio/navigation';
import { ClioObservabilityDock, ClioObservabilityView } from '@/components/clio/observability-dock';
import type { ResourceActions } from '@/components/clio/resource-dialogs';
import { ClioPendingInteractions } from '@/components/clio/pending-interactions';
import {
  ClioSessionBehaviorMenu,
  type SessionBehaviorPatch,
} from '@/components/clio/session-behavior-menu';
import { ClioSessionContextBar } from '@/components/clio/session-context-bar';
import type { SubagentOpenTarget } from '@/components/clio/subagent-card';
import { ClioWorkbench, type ClioWorkbenchOpenRequest } from '@/components/clio/workbench';
import {
  WorkspaceLoading,
  WorkspaceStatusStrip,
  WorkspaceUnavailable,
} from '@/components/clio/workspace-route-surfaces';
import * as workspaceRouteState from '@/components/clio/workspace-route-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useA2UILocalActions } from '@/hooks/use-a2ui-local-actions';
import { useRepository } from '@/hooks/use-repository';
import { useSessionObservability } from '@/hooks/use-session-observability';
import { useSessionHistoryActions } from '@/hooks/use-session-history-actions';
import { useSessionDiffActions } from '@/hooks/use-session-diff-actions';
import { useSessionCommands } from '@/hooks/use-session-commands';
import { useSessionContext } from '@/hooks/use-session-context';
import { useSessionLiveStream } from '@/hooks/use-session-live-stream';
import { useWorkspaceCapabilities } from '@/hooks/use-workspace-capabilities';
import { useAvailableSessionNavigation } from '@/hooks/use-available-session-navigation';
import { useContextTargetSelection } from '@/hooks/use-context-target-selection';
import { recordById } from '@/lib/entities';
import { connectionSessionRoute, latestConnectionSessionTarget } from '@/lib/connection-target';
import { resolveActiveBlueprint } from '@/lib/active-blueprint';
import { buildModelOptions } from '@/lib/model-options';
import { buildContextTargets, resolveContextSession } from '@/lib/context-targets';
import { sessionArtifactEntities } from '@/lib/session-artifacts';
import { useConnectionSettings } from '@/providers/connection-provider';
import { rememberValidatedWorkspaceRoute } from '@/lib/workspace-route-memory';
import { useLiveStore } from '@/store/live-store';

function isThinkingLevel(value?: string): value is 'off' | 'low' | 'medium' | 'high' {
  return value === 'off' || value === 'low' || value === 'medium' || value === 'high';
}

export function WorkspacePage() {
  const { workspaceId = '', sessionId = '' } = useParams();
  const { settings } = useConnectionSettings();
  const navigate = useNavigate();
  const navigateToAvailableSession = useAvailableSessionNavigation();
  const repository = useRepository();
  const queryClient = useQueryClient();
  const entities = useLiveStore((state) => state.entities);
  const replaceSnapshots = useLiveStore((state) => state.replaceSnapshots);
  const [workbenchRequest, setWorkbenchRequest] = useState<{
    endpoint: string;
    key: string;
    request: ClioWorkbenchOpenRequest;
  }>();
  const [composerDraftState, setComposerDraftState] = useState({ sessionId, value: '' });
  const composerDraft = composerDraftState.sessionId === sessionId ? composerDraftState.value : '';
  const setComposerDraft = useCallback(
    (value: string) => setComposerDraftState({ sessionId, value }),
    [sessionId],
  );
  const [composerFocusKey, setComposerFocusKey] = useState(0);
  const [startedSessionId, setStartedSessionId] = useState<string | undefined>(undefined);
  const [contextTargetId, setContextTargetId] = useContextTargetSelection(sessionId);
  const sessionHistory = useSessionHistoryActions(sessionId, workspaceId);
  const diffActions = useSessionDiffActions();
  const { commands, isPending, run } = useSessionCommands(sessionId, workspaceId);
  const { capabilities, modelConfiguration } = useWorkspaceCapabilities();
  const workspaces = useQuery({
    queryKey: ['workspaces', settings.endpoint],
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const sessions = useQuery({
    queryKey: ['sessions', settings.endpoint, workspaceId],
    queryFn: ({ signal }) => repository.sessions(workspaceId, signal),
    enabled: Boolean(workspaceId),
    refetchInterval: (query) => {
      const current = query.state.data?.find((item) => item.id === sessionId);
      return current &&
        ['queued', 'running', 'waiting_permission', 'waiting_user'].includes(current.state)
        ? 1_500
        : false;
    },
  });
  const allSessions = useQuery({
    queryKey: ['sessions', settings.endpoint, 'all'],
    queryFn: ({ signal }) => repository.allSessions(signal),
  });
  const transcript = useQuery({
    queryKey: ['transcript', settings.endpoint, sessionId],
    queryFn: ({ signal }) => repository.transcript(sessionId, signal),
    enabled: Boolean(sessionId),
  });
  const sessionArtifacts = useQuery({
    queryKey: ['session-artifacts', settings.endpoint, sessionId],
    queryFn: ({ signal }) => repository.sessionArtifacts(sessionId, signal),
    enabled: Boolean(sessionId),
  });
  const streamError = useSessionLiveStream({
    enabled: workspaceRouteState.canOpenSessionStream(capabilities.data?.gact_versions, sessionId),
    initialCursor: transcript.data?.cursor,
    sessionId,
    workspaceId,
  });
  const approvals = useQuery({
    queryKey: ['pending-approvals', settings.endpoint, 'all-active'],
    queryFn: ({ signal }) => repository.pendingApprovals(undefined, signal),
    enabled: Boolean(sessionId),
    refetchInterval: 1_500,
  });
  const questions = useQuery({
    queryKey: ['pending-questions', settings.endpoint, sessionId],
    queryFn: ({ signal }) => repository.questions(sessionId, signal, 'pending'),
    enabled: Boolean(sessionId),
  });

  useEffect(() => {
    if (workspaces.data) replaceSnapshots({ workspaces: recordById(workspaces.data) });
  }, [replaceSnapshots, workspaces.data]);

  useEffect(() => {
    if (sessions.data) replaceSnapshots({ sessions: recordById(sessions.data) });
  }, [replaceSnapshots, sessions.data]);

  useEffect(() => {
    if (!transcript.data) return;
    replaceSnapshots({
      messages: recordById(transcript.data.messages),
      tools: recordById(transcript.data.tools),
      tasks: recordById(transcript.data.tasks),
      subagents: recordById(transcript.data.subagents),
      artifacts: recordById(transcript.data.artifacts),
      surfaces: recordById(transcript.data.surfaces),
    });
  }, [replaceSnapshots, transcript.data]);

  const sessionCandidate =
    entities.sessions[sessionId] ?? sessions.data?.find((item) => item.id === sessionId);
  const session = sessionCandidate?.workspace_id === workspaceId ? sessionCandidate : undefined;
  const workspace =
    entities.workspaces[workspaceId] ?? workspaces.data?.find((item) => item.id === workspaceId);
  const recoveryTarget = useMemo(
    () => latestConnectionSessionTarget(workspaces.data ?? [], allSessions.data ?? []),
    [allSessions.data, workspaces.data],
  );
  useEffect(() => {
    if (
      session ||
      !recoveryTarget ||
      workspaces.isPending ||
      sessions.isPending ||
      allSessions.isPending
    ) {
      return;
    }
    void navigate(connectionSessionRoute(recoveryTarget), { replace: true });
  }, [
    allSessions.isPending,
    navigate,
    recoveryTarget,
    session,
    sessions.isPending,
    workspaces.isPending,
  ]);
  useEffect(() => {
    if (workspace?.id !== workspaceId) return;
    rememberValidatedWorkspaceRoute(settings.endpoint, workspaceId, session);
  }, [session, settings.endpoint, workspace?.id, workspaceId]);
  const parentSession = session?.parent_session_id
    ? allSessions.data?.find((item) => item.id === session.parent_session_id)
    : undefined;
  const transcriptError = workspaceRouteState.conversationUnavailableMessage(transcript.error);
  const contextTargetSession = resolveContextSession(
    contextTargetId,
    session,
    allSessions.data ?? [],
  );
  const sessionContext = useSessionContext(
    contextTargetId,
    contextTargetSession?.agent_id ?? 'main',
    Boolean(session && contextTargetSession),
  );
  const sessionObservability = useSessionObservability(sessionId);
  const contextObservability = useSessionObservability(contextTargetId);
  const workspaceFiles = useQuery({
    queryKey: ['workspace-files', settings.endpoint, workspaceId],
    queryFn: ({ signal }) => repository.workspaceFiles(workspaceId, signal),
    enabled: Boolean(workspaceId),
  });
  const agentBlueprints = useQuery({
    queryKey: ['agent-blueprints', settings.endpoint, workspaceId],
    queryFn: ({ signal }) => repository.agentBlueprints(workspaceId, signal),
    enabled: Boolean(workspaceId),
  });
  const recordedMessages = useMemo(
    () =>
      Object.values(entities.messages)
        .filter((message): message is Message => message.session_id === sessionId)
        .sort((left, right) => left.created_at.localeCompare(right.created_at)),
    [entities.messages, sessionId],
  );
  const tasks = Object.values(entities.tasks).filter((task) => task.session_id === sessionId);
  const tools = Object.values(entities.tools).filter((tool) => tool.session_id === sessionId);
  const transcriptArtifacts = useMemo(
    () => Object.values(entities.artifacts).filter((artifact) => artifact.session_id === sessionId),
    [entities.artifacts, sessionId],
  );
  const artifacts = useMemo(
    () => sessionArtifactEntities(sessionArtifacts.data, transcriptArtifacts, sessionId),
    [sessionArtifacts.data, sessionId, transcriptArtifacts],
  );
  const recordedSubagents = useMemo(
    () => Object.values(entities.subagents).filter((subagent) => subagent.session_id === sessionId),
    [entities.subagents, sessionId],
  );
  const messages = recordedMessages;
  const processes = sessionObservability.processes.data ?? [];
  const subagents = recordedSubagents;
  const conversationStarted = messages.length > 0 || startedSessionId === sessionId;
  const setConversationStarted = useCallback(
    (started: boolean) =>
      setStartedSessionId((current) =>
        started ? sessionId : current === sessionId ? undefined : current,
      ),
    [sessionId],
  );
  const interactionSessionIds = useMemo(() => {
    const related = new Set([sessionId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const subagent of Object.values(entities.subagents)) {
        if (
          subagent.child_session_id &&
          related.has(subagent.session_id) &&
          !related.has(subagent.child_session_id)
        ) {
          related.add(subagent.child_session_id);
          changed = true;
        }
      }
      for (const candidate of allSessions.data ?? []) {
        if (
          candidate.parent_session_id &&
          related.has(candidate.parent_session_id) &&
          !related.has(candidate.id)
        ) {
          related.add(candidate.id);
          changed = true;
        }
      }
    }
    return related;
  }, [allSessions.data, entities.subagents, sessionId]);
  const visibleApprovals = useMemo(
    () =>
      (approvals.data ?? []).filter((approval) => interactionSessionIds.has(approval.session_id)),
    [approvals.data, interactionSessionIds],
  );
  const conversationSubagents = useMemo(() => recordById(subagents), [subagents]);
  const runs = Object.values(entities.runs).filter((run) => run.session_id === sessionId);
  const context = sessionContext.state.data ?? entities.context[contextTargetId];
  const activeProvider =
    session?.provider_id ??
    modelConfiguration.data?.provider ??
    capabilities.data?.active_model?.provider_id;
  const activeModel =
    session?.model_id ??
    modelConfiguration.data?.model ??
    capabilities.data?.active_model?.model_id;
  const activeEffort =
    session?.effort ??
    modelConfiguration.data?.thinking_level ??
    capabilities.data?.active_model?.effort;
  const activeBlueprint = resolveActiveBlueprint(session, agentBlueprints.data);
  const contextAgentLabel = activeBlueprint?.display_name ?? session?.agent_id;
  const contextTargetOptions = buildContextTargets(sessionId, contextAgentLabel, subagents);
  const activePreset = modelConfiguration.data?.presets.find(
    (preset) => preset.id === activeProvider || preset.provider === activeProvider,
  );
  const activeCatalogProvider = activePreset?.id ?? activeProvider ?? '';
  const modelCatalog = useQuery({
    queryKey: ['provider-models', settings.endpoint, activeCatalogProvider],
    queryFn: ({ signal }) => repository.providerModels(activeCatalogProvider, signal),
    enabled: Boolean(activeCatalogProvider),
  });
  const modelOptions = buildModelOptions({
    activeCatalogProvider,
    activeModel,
    activeProvider,
    catalogModels: modelCatalog.data?.models,
    presets: modelConfiguration.data?.presets ?? [],
  });
  const showConversationWelcome =
    messages.length === 0 && !transcript.isPending && !transcriptError && !conversationStarted;

  const revealWorkbench = useCallback(
    (request: ClioWorkbenchOpenRequest) => {
      setWorkbenchRequest({
        endpoint: settings.endpoint,
        key: `${request.kind}:${Date.now()}`,
        request,
      });
    },
    [settings.endpoint],
  );

  const openSubagent = useCallback(
    (subagent: SubagentRun, target: SubagentOpenTarget) => {
      if (!subagent.child_session_id) return;
      if (target === 'canvas') {
        revealWorkbench({
          kind: 'subagent',
          subagent,
        });
        return;
      }
      const child = allSessions.data?.find((item) => item.id === subagent.child_session_id);
      void navigate(
        `/workspaces/${encodeURIComponent(child?.workspace_id ?? workspaceId)}/sessions/${encodeURIComponent(subagent.child_session_id)}`,
      );
    },
    [allSessions.data, navigate, revealWorkbench, workspaceId],
  );
  const openArtifact = useCallback(
    (artifact: Artifact) => revealWorkbench({ kind: 'artifact', artifact }),
    [revealWorkbench],
  );
  const openWorkspaceFile = useCallback(
    (path: string) => revealWorkbench({ kind: 'workspace-file', path }),
    [revealWorkbench],
  );
  const openDiff = useCallback(
    (diff: SessionDiff) => revealWorkbench({ kind: 'diff', diff }),
    [revealWorkbench],
  );
  const handleA2UILocalAction = useA2UILocalActions(entities.artifacts, sessionId, openArtifact);

  const send = useMutation({
    mutationFn: async (value: {
      text: string;
      provider?: string;
      model?: string;
      effort?: string;
    }) => {
      const selectedPreset = modelConfiguration.data?.presets.find(
        (preset) => preset.id === value.provider || preset.provider === value.provider,
      );
      const provider = selectedPreset?.provider ?? value.provider;
      const model = value.model;
      const effort = isThinkingLevel(value.effort) ? value.effort : undefined;
      const configured = modelConfiguration.data;

      if (
        provider &&
        model &&
        (!configured ||
          configured.provider !== provider ||
          configured.model !== model ||
          (effort !== undefined && configured.thinking_level !== effort))
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
          ['language-model-configuration', settings.endpoint],
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
        queryClient.setQueryData(
          ['sessions', settings.endpoint, workspaceId],
          (current: typeof sessions.data) =>
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
        queryClient.invalidateQueries({ queryKey: ['transcript', settings.endpoint, sessionId] }),
        queryClient.invalidateQueries({ queryKey: ['sessions', settings.endpoint, workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['sessions', settings.endpoint, 'all'] }),
        queryClient.invalidateQueries({ queryKey: ['capabilities', settings.endpoint] }),
      ]);
    },
  });
  const cancel = useMutation({
    mutationFn: () => repository.cancelSession(sessionId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transcript', settings.endpoint, sessionId] }),
        queryClient.invalidateQueries({ queryKey: ['sessions', settings.endpoint, workspaceId] }),
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
        queryClient.invalidateQueries({ queryKey: ['transcript', settings.endpoint, sessionId] }),
        queryClient.invalidateQueries({ queryKey: ['sessions', settings.endpoint, workspaceId] }),
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
        queryKey: ['sessions', settings.endpoint, workspaceId],
      });
    },
  });
  const refreshNavigation = useCallback(
    async (targetWorkspaceId = workspaceId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspaces', settings.endpoint] }),
        queryClient.invalidateQueries({ queryKey: ['sessions', settings.endpoint, 'all'] }),
        queryClient.invalidateQueries({
          queryKey: ['sessions', settings.endpoint, targetWorkspaceId],
        }),
      ]);
    },
    [queryClient, settings.endpoint, workspaceId],
  );
  const navigationActions = useMemo<ResourceActions>(
    () => ({
      createWorkspace: async ({ name, rootPath }) => {
        await repository.createWorkspace({ name, root_path: rootPath });
        await refreshNavigation();
      },
      createSession: async ({
        title,
        workspaceId: targetWorkspaceId,
        blueprintId,
        mode,
        routingMode,
        approvalMode,
      }) => {
        const created = await repository.createSession({
          workspace_id: targetWorkspaceId,
          title,
          mode,
          routing_mode: routingMode,
          approval_mode: approvalMode,
        });
        if (blueprintId) await repository.setSessionAgentBlueprint(created.id, blueprintId);
        await refreshNavigation(targetWorkspaceId);
        await navigate(
          `/workspaces/${encodeURIComponent(targetWorkspaceId)}/sessions/${encodeURIComponent(created.id)}`,
        );
      },
      renameWorkspace: async (targetWorkspaceId, name) => {
        await repository.updateWorkspace(targetWorkspaceId, { name });
        await refreshNavigation(targetWorkspaceId);
      },
      grantWorkspaceFolder: async (targetWorkspaceId, path) => {
        await repository.grantWorkspaceFolder(targetWorkspaceId, path);
        await refreshNavigation(targetWorkspaceId);
      },
      revokeWorkspaceFolder: async (targetWorkspaceId, path) => {
        await repository.revokeWorkspaceFolder(targetWorkspaceId, path);
        await refreshNavigation(targetWorkspaceId);
      },
      renameSession: async (targetSessionId, title) => {
        await repository.updateSession(targetSessionId, { title });
        await refreshNavigation();
      },
      setWorkspacePinned: async (targetWorkspaceId, pinned) => {
        await repository.updateWorkspace(targetWorkspaceId, { pinned });
        await refreshNavigation(targetWorkspaceId);
      },
      setSessionPinned: async (targetSessionId, pinned) => {
        await repository.updateSession(targetSessionId, { pinned });
        await refreshNavigation();
      },
      archiveSession: async (targetSessionId) => {
        await repository.updateSession(targetSessionId, { archived: true });
        if (targetSessionId === sessionId) {
          await navigateToAvailableSession();
          return;
        }
        await refreshNavigation();
      },
      restoreSession: async (targetSessionId) => {
        await repository.updateSession(targetSessionId, { archived: false });
        await refreshNavigation();
      },
      deleteWorkspace: async (targetWorkspaceId) => {
        await repository.deleteWorkspace(targetWorkspaceId);
        if (targetWorkspaceId === workspaceId) {
          await navigateToAvailableSession();
          return;
        }
        await refreshNavigation(targetWorkspaceId);
      },
      deleteSession: async (targetSessionId) => {
        await repository.deleteSession(targetSessionId);
        if (targetSessionId === sessionId) {
          await navigateToAvailableSession();
          return;
        }
        await refreshNavigation();
      },
      exportSession: (targetSessionId) => repository.exportSession(targetSessionId),
      importSession: async (value) => {
        const imported = await repository.importSession(value);
        await refreshNavigation(imported.workspace_id);
        await navigate(
          `/workspaces/${encodeURIComponent(imported.workspace_id)}/sessions/${encodeURIComponent(imported.id)}`,
        );
      },
    }),
    [navigate, navigateToAvailableSession, refreshNavigation, repository, sessionId, workspaceId],
  );
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
          queryKey: ['pending-approvals', settings.endpoint],
        }),
        queryClient.invalidateQueries({
          queryKey: ['sessions', settings.endpoint, workspaceId],
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
          queryKey: ['pending-questions', settings.endpoint, sessionId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['sessions', settings.endpoint, workspaceId],
        }),
      ]);
    },
  });
  const cancelQuestion = useMutation({
    mutationFn: (id: string) => repository.cancelQuestion(sessionId, id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['pending-questions', settings.endpoint, sessionId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['sessions', settings.endpoint, workspaceId],
        }),
      ]);
    },
  });
  const actionCard = useMutation({
    mutationFn: async (action: {
      id: string;
      label: string;
      enabled: boolean;
      behavior: { kind: string; handle_id?: string; reason?: string };
    }) => {
      if (action.behavior.kind !== 'focus_session' || !action.behavior.handle_id) {
        throw new Error(action.behavior.reason || 'This action is not available.');
      }
      return repository.agentTask(action.behavior.handle_id);
    },
    onSuccess: (task) => {
      void navigate(`/workspaces/${workspaceId}/sessions/${task.child_session_id}`);
    },
  });

  const queryError = capabilities.error ?? workspaces.error ?? sessions.error ?? transcript.error;
  if (
    !session &&
    (capabilities.isPending || workspaces.isPending || sessions.isPending || allSessions.isPending)
  ) {
    return <WorkspaceLoading />;
  }
  if (!session && recoveryTarget) {
    return (
      <WorkspaceLoading
        description="The previous conversation is no longer available. Opening the most recent conversation on this service instead."
        label="Recovering workspace"
      />
    );
  }
  if (queryError && !session) {
    return (
      <WorkspaceUnavailable
        error={queryError.message}
        onRetry={() => {
          void Promise.all([
            capabilities.refetch(),
            workspaces.refetch(),
            sessions.refetch(),
            allSessions.refetch(),
            transcript.refetch(),
          ]);
        }}
      />
    );
  }
  if (!session) {
    return (
      <WorkspaceUnavailable
        error="This agent service did not return the requested session."
        onRetry={() => {
          void Promise.all([workspaces.refetch(), sessions.refetch(), allSessions.refetch()]);
        }}
      />
    );
  }

  const state: RunState = send.isPending ? 'queued' : (session?.state ?? 'interrupted');
  const activeWorkCount = workspaceRouteState.countActiveWork(runs, tasks, tools);
  const renderComposer = (variant: 'docked' | 'welcome') => (
    <m.div
      className={variant === 'welcome' ? 'w-full' : 'relative shrink-0'}
      key={variant}
      layout
      layoutId={`session-composer:${sessionId}`}
    >
      <ClioComposer
        activityControl={
          variant === 'docked' ? (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <ClioObservabilityDock
                artifacts={artifacts}
                context={context}
                contextFiles={sessionObservability.contextFiles.data ?? []}
                contextFrames={sessionObservability.contextFrames.data ?? []}
                diffs={sessionObservability.diffs.data ?? []}
                messages={messages}
                onOpenCanvas={() => revealWorkbench({ kind: 'session' })}
                onOpenArtifact={openArtifact}
                onOpenDiff={openDiff}
                onOpenFile={openWorkspaceFile}
                onOpenSubagent={openSubagent}
                processes={processes}
                runs={runs}
                sessionState={state}
                subagents={subagents}
                tasks={tasks}
                tools={tools}
              />
            </div>
          ) : undefined
        }
        attachments={capabilities.data?.capabilities.attachments === true}
        behaviorControl={
          <ClioSessionBehaviorMenu
            disabled={updateSessionBehavior.isPending}
            onChange={async (patch) => {
              await updateSessionBehavior.mutateAsync(patch);
            }}
            session={session}
          />
        }
        commands={commands}
        disabled={!session || send.isPending || cancel.isPending || isPending}
        effort={activeEffort}
        focusRequestKey={composerFocusKey}
        key={`composer:${activeProvider ?? ''}:${activeModel ?? ''}:${activeEffort ?? ''}`}
        model={activeModel}
        modelOptions={modelOptions}
        onCommand={async (value) => {
          const startedFromWelcome = showConversationWelcome;
          if (startedFromWelcome) setConversationStarted(true);
          try {
            await run(value);
          } catch (error) {
            if (startedFromWelcome && messages.length === 0) setConversationStarted(false);
            throw error;
          }
        }}
        onSubmit={async (value) => {
          const startedFromWelcome = showConversationWelcome;
          if (startedFromWelcome) setConversationStarted(true);
          try {
            await send.mutateAsync(value);
          } catch (error) {
            if (startedFromWelcome && messages.length === 0) setConversationStarted(false);
            throw error;
          }
        }}
        onStop={() => cancel.mutate()}
        onValueChange={setComposerDraft}
        provider={activeProvider}
        state={state}
        value={composerDraft}
        variant={variant}
      />
    </m.div>
  );
  return (
    <>
      <ClioCommandMenu onOpenResource={revealWorkbench} />
      <ClioAppShell
        navigation={
          <ClioNavigation
            activeSessionId={sessionId}
            activeWorkspaceId={workspaceId}
            actions={navigationActions}
            blueprints={agentBlueprints.data ?? []}
            endpoint={settings.endpoint}
            onOpenWorkspaceFiles={() => revealWorkbench({ kind: 'resources', section: 'files' })}
            sessions={allSessions.data ?? sessions.data ?? []}
            workspaces={workspaces.data ?? []}
          />
        }
        contextBar={
          <ClioSessionContextBar
            activeBlueprint={activeBlueprint}
            actionsPending={
              sessionHistory.fork.isPending ||
              sessionHistory.compact.isPending ||
              sessionHistory.undo.isPending ||
              sessionHistory.rewind.isPending ||
              sessionHistory.share.isPending ||
              updateSessionBehavior.isPending
            }
            onCompact={async () => {
              await sessionHistory.compact.mutateAsync();
            }}
            onFork={async () => {
              await sessionHistory.fork.mutateAsync(undefined);
            }}
            onOpenBlueprint={(blueprint) => revealWorkbench({ kind: 'blueprint', blueprint })}
            onReturnToParent={(parent) =>
              navigate(
                `/workspaces/${encodeURIComponent(parent.workspace_id)}/sessions/${encodeURIComponent(parent.id)}`,
              )
            }
            onShare={async (ttlSeconds) => (await sessionHistory.share.mutateAsync(ttlSeconds)).url}
            onUndo={async () => {
              await sessionHistory.undo.mutateAsync();
            }}
            parentSession={parentSession}
            session={session}
          />
        }
        workbench={
          <ClioWorkbench
            artifacts={artifacts}
            artifactsError={sessionArtifacts.error?.message}
            artifactsPending={sessionArtifacts.isPending}
            artifactsTruncated={sessionArtifacts.data?.truncated}
            blueprints={agentBlueprints.data ?? []}
            blueprintsError={agentBlueprints.error?.message}
            blueprintsPending={agentBlueprints.isPending}
            diffActionError={(diffActions.apply.error ?? diffActions.reject.error)?.message}
            diffActionPending={diffActions.apply.isPending || diffActions.reject.isPending}
            diffs={sessionObservability.diffs.data ?? []}
            files={workspaceFiles.data ?? []}
            filesError={workspaceFiles.error?.message}
            filesPending={workspaceFiles.isPending}
            onApplyDiff={(targetSessionId, targetWorkspaceId, path) =>
              diffActions.apply.mutateAsync({
                sessionId: targetSessionId,
                workspaceId: targetWorkspaceId,
                path,
              })
            }
            onOpenSubagent={openSubagent}
            onRejectDiff={(targetSessionId, targetWorkspaceId, path) =>
              diffActions.reject.mutateAsync({
                sessionId: targetSessionId,
                workspaceId: targetWorkspaceId,
                path,
              })
            }
            key={settings.endpoint}
            requestedOpen={
              workbenchRequest?.endpoint === settings.endpoint ? workbenchRequest : undefined
            }
            sessionId={sessionId}
            sessionView={
              <ClioObservabilityView
                artifacts={artifacts}
                context={context}
                contextError={sessionContext.state.error?.message}
                contextFiles={contextObservability.contextFiles.data ?? []}
                contextFrames={contextObservability.contextFrames.data ?? []}
                contextPreferencesPending={sessionContext.preferences.isPending}
                contextTargets={contextTargetOptions}
                compactContextPending={sessionContext.compact.isPending}
                diffs={sessionObservability.diffs.data ?? []}
                messages={messages}
                onOpenArtifact={openArtifact}
                onOpenDiff={openDiff}
                onOpenFile={openWorkspaceFile}
                onOpenSubagent={openSubagent}
                onCompactContext={() => sessionContext.compact.mutateAsync()}
                onContextTargetChange={setContextTargetId}
                onUpdateContextPreferences={(input) =>
                  sessionContext.preferences.mutateAsync(input)
                }
                processes={processes}
                runs={runs}
                subagents={subagents}
                selectedContextTargetId={contextTargetId}
                tasks={tasks}
                tools={tools}
              />
            }
            workspaceId={workspaceId}
          />
        }
        workbenchRevealKey={
          workbenchRequest?.endpoint === settings.endpoint ? workbenchRequest.key : undefined
        }
        statusStrip={
          <WorkspaceStatusStrip
            activeWorkCount={activeWorkCount}
            a2uiVersions={capabilities.data?.a2ui_versions}
            cost={entities.usage[sessionId]?.cost_usd}
            cursor={entities.cursor}
            gactVersions={capabilities.data?.gact_versions}
            inputTokens={entities.usage[sessionId]?.input_tokens}
            service={capabilities.data?.service}
            sessionState={session?.state}
            stream={entities.stream}
            streamError={streamError}
          />
        }
      >
        <section className="relative flex h-full min-w-0 flex-col bg-background">
          {streamError ? (
            <Alert className="m-3 mb-0 rounded-lg" variant="destructive">
              <AlertTriangleIcon aria-hidden="true" />
              <AlertTitle>Live stream needs reconciliation</AlertTitle>
              <AlertDescription>{streamError}</AlertDescription>
            </Alert>
          ) : null}
          {transcriptError && messages.length > 0 ? (
            <Alert className="m-3 mb-0" variant="destructive">
              <AlertTriangleIcon aria-hidden="true" />
              <AlertTitle>Conversation unavailable</AlertTitle>
              <AlertDescription>{transcriptError}</AlertDescription>
            </Alert>
          ) : null}
          <LayoutGroup id={`session-layout:${sessionId}`}>
            <AnimatePresence initial={false} mode="popLayout">
              {showConversationWelcome ? (
                <m.div
                  animate={{ opacity: 1 }}
                  className="clio-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6"
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                  key="welcome"
                >
                  <div className="flex min-h-full items-center">
                    <ClioConversationWelcome
                      disabled={!session || send.isPending || cancel.isPending || isPending}
                      onSelectPrompt={(prompt) => {
                        setComposerDraft(prompt);
                        setComposerFocusKey((current) => current + 1);
                      }}
                    >
                      {renderComposer('welcome')}
                    </ClioConversationWelcome>
                  </div>
                </m.div>
              ) : (
                <m.div
                  animate={{ opacity: 1 }}
                  className="min-h-0 flex-1"
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                  key="conversation"
                >
                  <ClioConversation
                    artifacts={entities.artifacts}
                    error={transcriptError}
                    loading={transcript.isPending}
                    messages={messages}
                    onActionCardAction={actionCard.mutateAsync}
                    onA2UILocalAction={handleA2UILocalAction}
                    onOpenArtifact={openArtifact}
                    onOpenFile={openWorkspaceFile}
                    forkingMessageId={
                      sessionHistory.fork.isPending && sessionHistory.fork.variables
                        ? sessionHistory.fork.variables
                        : undefined
                    }
                    onForkFromMessage={sessionHistory.fork.mutateAsync}
                    onOpenSubagent={openSubagent}
                    onRewindToMessage={sessionHistory.rewind.mutateAsync}
                    onRetryMessage={retry.mutateAsync}
                    rewindingMessageId={
                      sessionHistory.rewind.isPending ? sessionHistory.rewind.variables : undefined
                    }
                    retryingMessageId={retry.isPending ? retry.variables : undefined}
                    subagents={conversationSubagents}
                    surfaces={entities.surfaces}
                    tasks={entities.tasks}
                    tools={entities.tools}
                  />
                </m.div>
              )}
            </AnimatePresence>
            {actionCard.error ? (
              <Alert className="mx-4 mb-3" variant="destructive">
                <AlertTriangleIcon aria-hidden="true" />
                <AlertTitle>Action unavailable</AlertTitle>
                <AlertDescription>{actionCard.error.message}</AlertDescription>
              </Alert>
            ) : null}
            {retry.error ? (
              <Alert className="mx-4 mb-3" variant="destructive">
                <AlertTriangleIcon aria-hidden="true" />
                <AlertTitle>Retry unavailable</AlertTitle>
                <AlertDescription>{retry.error.message}</AlertDescription>
              </Alert>
            ) : null}
            {approvals.error || questions.error ? (
              <Alert className="mx-4 mb-3" variant="destructive">
                <AlertTriangleIcon aria-hidden="true" />
                <AlertTitle>Responses unavailable</AlertTitle>
                <AlertDescription>{(approvals.error ?? questions.error)?.message}</AlertDescription>
              </Alert>
            ) : null}
            <ClioPendingInteractions
              approvals={visibleApprovals}
              disabled={
                respondPermission.isPending || answerQuestion.isPending || cancelQuestion.isPending
              }
              onAnswer={async (id, answer) => {
                await answerQuestion.mutateAsync({ id, answer });
              }}
              onApproval={async (id, action) => {
                await respondPermission.mutateAsync({ id, action });
              }}
              onCancelQuestion={async (id) => {
                await cancelQuestion.mutateAsync(id);
              }}
              questions={questions.data ?? []}
            />
            <AnimatePresence initial={false}>
              {showConversationWelcome ? null : renderComposer('docked')}
            </AnimatePresence>
          </LayoutGroup>
        </section>
      </ClioAppShell>
    </>
  );
}
