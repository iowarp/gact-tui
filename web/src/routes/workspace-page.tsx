import type { Artifact, Message, RunState, SessionDiff, SubagentRun } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ClioAppShell } from '@/components/clio/app-shell';
import { ClioCommandMenu } from '@/components/clio/command-menu';
import { ClioComposer } from '@/components/clio/composer';
import { ClioConversation } from '@/components/clio/conversation';
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
import { useContextTargetSelection } from '@/hooks/use-context-target-selection';
import { recordById } from '@/lib/entities';
import { resolveActiveBlueprint } from '@/lib/active-blueprint';
import { buildModelOptions } from '@/lib/model-options';
import { buildContextTargets, resolveContextSession } from '@/lib/context-targets';
import { sessionChildRelations } from '@/lib/session-child-relations';
import { sessionArtifactEntities } from '@/lib/session-artifacts';
import { useConnectionSettings } from '@/providers/connection-provider';
import { rememberValidatedWorkspaceRoute } from '@/lib/workspace-route-memory';
import { useLiveStore } from '@/store/live-store';
export function WorkspacePage() {
  const { workspaceId = '', sessionId = '' } = useParams();
  const { settings } = useConnectionSettings();
  const navigate = useNavigate();
  const repository = useRepository();
  const queryClient = useQueryClient();
  const entities = useLiveStore((state) => state.entities);
  const replaceSnapshots = useLiveStore((state) => state.replaceSnapshots);
  const [workbenchRequest, setWorkbenchRequest] = useState<{
    endpoint: string;
    key: string;
    request: ClioWorkbenchOpenRequest;
  }>();
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
  const relations = useMemo(
    () =>
      sessionChildRelations({
        messages: recordedMessages,
        parentSessionId: sessionId,
        processes: sessionObservability.processes.data ?? [],
        sessions: allSessions.data ?? [],
        subagents: recordedSubagents,
      }),
    [
      allSessions.data,
      recordedMessages,
      recordedSubagents,
      sessionId,
      sessionObservability.processes.data,
    ],
  );
  const { messages, processes, subagents } = relations;
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
  const activeProvider = session?.provider_id ?? capabilities.data?.active_model?.provider_id;
  const activeModel = session?.model_id ?? capabilities.data?.active_model?.model_id;
  const activeEffort = session?.effort ?? capabilities.data?.active_model?.effort;
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
    mutationFn: (value: { text: string; provider?: string; model?: string; effort?: string }) =>
      repository.sendMessage(sessionId, value.text, {
        provider_id: value.provider,
        model_id: value.model,
        effort: value.effort,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transcript', settings.endpoint, sessionId] }),
        queryClient.invalidateQueries({ queryKey: ['sessions', settings.endpoint, workspaceId] }),
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
        await refreshNavigation();
        if (targetSessionId === sessionId) await navigate('/');
      },
      restoreSession: async (targetSessionId) => {
        await repository.updateSession(targetSessionId, { archived: false });
        await refreshNavigation();
      },
      deleteWorkspace: async (targetWorkspaceId) => {
        await repository.deleteWorkspace(targetWorkspaceId);
        await refreshNavigation(targetWorkspaceId);
        if (targetWorkspaceId === workspaceId) await navigate('/');
      },
      deleteSession: async (targetSessionId) => {
        await repository.deleteSession(targetSessionId);
        await refreshNavigation();
        if (targetSessionId === sessionId) await navigate('/');
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
    [navigate, refreshNavigation, repository, sessionId, workspaceId],
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
  if (queryError && !session) {
    return <WorkspaceUnavailable error={queryError.message} />;
  }
  if (!session) {
    return (
      <WorkspaceUnavailable error="This agent service did not return the requested session." />
    );
  }

  const state: RunState = send.isPending ? 'queued' : (session?.state ?? 'interrupted');
  const activeWorkCount = workspaceRouteState.countActiveWork(runs, tasks, tools);
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
          <div className="min-h-0 flex-1">
            <ClioConversation
              artifacts={entities.artifacts}
              error={transcriptError}
              iterations={sessionObservability.iterations.data ?? []}
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
          </div>
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
          <div className="relative shrink-0">
            <ClioComposer
              activityControl={
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
                  {session ? (
                    <ClioSessionBehaviorMenu
                      disabled={updateSessionBehavior.isPending}
                      onChange={async (patch) => {
                        await updateSessionBehavior.mutateAsync(patch);
                      }}
                      session={session}
                    />
                  ) : null}
                </div>
              }
              attachments={capabilities.data?.capabilities.attachments === true}
              commands={commands}
              disabled={!session || send.isPending || cancel.isPending || isPending}
              effort={activeEffort}
              key={`composer:${activeProvider ?? ''}:${activeModel ?? ''}:${activeEffort ?? ''}`}
              model={activeModel}
              modelOptions={modelOptions}
              onCommand={run}
              onSubmit={async (value) => {
                await send.mutateAsync(value);
              }}
              onStop={() => cancel.mutate()}
              provider={activeProvider}
              state={state}
            />
          </div>
        </section>
      </ClioAppShell>
    </>
  );
}
