import type { Artifact, Message, RunState, SessionDiff, SubagentRun } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ClioAppShell } from '@/components/clio/app-shell';
import { ClioCommandMenu } from '@/components/clio/command-menu';
import { ClioComposer } from '@/components/clio/composer';
import { ClioConversation } from '@/components/clio/conversation';
import { ClioNavigation } from '@/components/clio/navigation';
import { ClioObservabilityDock, ClioObservabilityView } from '@/components/clio/observability-dock';
import type { ResourceActions } from '@/components/clio/resource-dialogs';
import { ClioPendingInteractions } from '@/components/clio/pending-interactions';
import type { SessionBehaviorPatch } from '@/components/clio/session-behavior-menu';
import { ClioSessionContextBar } from '@/components/clio/session-context-bar';
import type { SubagentOpenTarget } from '@/components/clio/subagent-card';
import {
  ClioWorkbench,
  type ClioWorkbenchHandle,
  type ClioWorkbenchOpenRequest,
} from '@/components/clio/workbench';
import {
  WorkspaceLoading,
  WorkspaceStatusStrip,
  WorkspaceUnavailable,
} from '@/components/clio/workspace-route-surfaces';
import { countActiveWork } from '@/components/clio/workspace-route-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useA2UILocalActions } from '@/hooks/use-a2ui-local-actions';
import { useRepository } from '@/hooks/use-repository';
import { useSessionObservability } from '@/hooks/use-session-observability';
import { useSessionHistoryActions } from '@/hooks/use-session-history-actions';
import { useSessionDiffActions } from '@/hooks/use-session-diff-actions';
import { useSessionCommands } from '@/hooks/use-session-commands';
import { useSessionContext } from '@/hooks/use-session-context';
import { useSessionLiveStream } from '@/hooks/use-session-live-stream';
import { recordById } from '@/lib/entities';
import { buildModelOptions } from '@/lib/model-options';
import { useConnectionSettings } from '@/providers/connection-provider';
import { rememberWorkspaceRoute } from '@/lib/workspace-route-memory';
import { useLiveStore } from '@/store/live-store';
export function WorkspacePage() {
  const { workspaceId = '', sessionId = '' } = useParams();
  useEffect(() => {
    if (workspaceId && sessionId) rememberWorkspaceRoute(workspaceId, sessionId);
  }, [sessionId, workspaceId]);
  const navigate = useNavigate();
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const entities = useLiveStore((state) => state.entities);
  const replaceSnapshots = useLiveStore((state) => state.replaceSnapshots);
  const workbenchRef = useRef<ClioWorkbenchHandle>(null);
  const [workbenchRequest, setWorkbenchRequest] = useState<{
    key: string;
    request: ClioWorkbenchOpenRequest;
  }>();
  const sessionHistory = useSessionHistoryActions(sessionId, workspaceId);
  const diffActions = useSessionDiffActions();
  const { commands, isPending, run } = useSessionCommands(sessionId, workspaceId);
  const capabilities = useQuery({
    queryKey: ['capabilities', settings.endpoint],
    queryFn: ({ signal }) => repository.capabilities(signal),
  });
  const streamError = useSessionLiveStream({
    enabled: Boolean(capabilities.data?.gact_versions.includes('0.3')),
    sessionId,
    workspaceId,
  });
  const modelConfiguration = useQuery({
    queryKey: ['language-model-configuration', settings.endpoint],
    queryFn: ({ signal }) => repository.languageModelConfiguration(signal),
  });
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
  const approvals = useQuery({
    queryKey: ['pending-approvals', settings.endpoint, sessionId],
    queryFn: ({ signal }) => repository.pendingApprovals(sessionId, signal),
    enabled: Boolean(sessionId),
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

  const session =
    entities.sessions[sessionId] ?? sessions.data?.find((item) => item.id === sessionId);
  const workspace =
    entities.workspaces[workspaceId] ?? workspaces.data?.find((item) => item.id === workspaceId);
  const parentSession = session?.parent_session_id
    ? allSessions.data?.find((item) => item.id === session.parent_session_id)
    : undefined;
  const sessionContext = useSessionContext(
    sessionId,
    session?.agent_id ?? 'main',
    Boolean(session),
  );
  const sessionObservability = useSessionObservability(sessionId);
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
  const messages = useMemo(
    () =>
      Object.values(entities.messages)
        .filter((message): message is Message => message.session_id === sessionId)
        .sort((left, right) => left.created_at.localeCompare(right.created_at)),
    [entities.messages, sessionId],
  );
  const tasks = Object.values(entities.tasks).filter((task) => task.session_id === sessionId);
  const tools = Object.values(entities.tools).filter((tool) => tool.session_id === sessionId);
  const artifacts = Object.values(entities.artifacts).filter(
    (artifact) => artifact.session_id === sessionId,
  );
  const subagents = Object.values(entities.subagents).filter(
    (subagent) => subagent.session_id === sessionId,
  );
  const runs = Object.values(entities.runs).filter((run) => run.session_id === sessionId);
  const context = sessionContext.state.data ?? entities.context[sessionId];
  const activeProvider = session?.provider_id ?? capabilities.data?.active_model?.provider_id;
  const activeModel = session?.model_id ?? capabilities.data?.active_model?.model_id;
  const activeEffort = session?.effort ?? capabilities.data?.active_model?.effort;
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

  const revealWorkbench = useCallback((request: ClioWorkbenchOpenRequest) => {
    workbenchRef.current?.open(request);
    setWorkbenchRequest({ key: `${request.kind}:${Date.now()}`, request });
  }, []);

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
          queryKey: ['pending-approvals', settings.endpoint, sessionId],
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
    return <WorkspaceUnavailable error="This agent service did not return the requested session." />;
  }

  const state: RunState = send.isPending ? 'queued' : (session?.state ?? 'interrupted');
  const activeWorkCount = countActiveWork(runs, tasks, tools);
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
            onBehaviorChange={async (patch) => {
              await updateSessionBehavior.mutateAsync(patch);
            }}
            onFork={async () => {
              await sessionHistory.fork.mutateAsync(undefined);
            }}
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
            workspaceDisplayName={workspace?.display_name}
          />
        }
        workbench={
          <ClioWorkbench
            artifacts={artifacts}
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
            ref={workbenchRef}
            requestedOpen={workbenchRequest}
            sessionId={sessionId}
            sessionView={
              <ClioObservabilityView
                artifacts={artifacts}
                context={context}
                contextError={(sessionContext.state.error ?? sessionContext.policy.error)?.message}
                contextFiles={sessionObservability.contextFiles.data ?? []}
                contextFrames={sessionObservability.contextFrames.data ?? []}
                contextPolicy={sessionContext.policy.data}
                compactContextPending={sessionContext.compact.isPending}
                diffs={sessionObservability.diffs.data ?? []}
                messages={messages}
                onOpenArtifact={openArtifact}
                onOpenDiff={openDiff}
                onOpenFile={openWorkspaceFile}
                onOpenSubagent={openSubagent}
                onCompactContext={() => sessionContext.compact.mutateAsync()}
                presentation="canvas"
                processes={sessionObservability.processes.data ?? []}
                runs={runs}
                subagents={subagents}
                tasks={tasks}
                tools={tools}
              />
            }
            workspaceId={workspaceId}
          />
        }
        workbenchRevealKey={workbenchRequest?.key}
        statusStrip={
          <WorkspaceStatusStrip
            activeWorkCount={activeWorkCount}
            cost={entities.usage[sessionId]?.cost_usd}
            cursor={entities.cursor}
            inputTokens={entities.usage[sessionId]?.input_tokens}
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
          {transcript.error ? (
            <Alert className="m-3 mb-0" variant="destructive">
              <AlertTriangleIcon aria-hidden="true" />
              <AlertTitle>Conversation unavailable</AlertTitle>
              <AlertDescription>{transcript.error.message}</AlertDescription>
            </Alert>
          ) : null}
          <div className="min-h-0 flex-1">
            <ClioConversation
              artifacts={entities.artifacts}
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
              subagents={entities.subagents}
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
            approvals={approvals.data ?? []}
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
                  processes={sessionObservability.processes.data ?? []}
                  runs={runs}
                  subagents={subagents}
                  tasks={tasks}
                  tools={tools}
                />
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
              onRoutingModeChange={async (routingMode) => {
                await updateSessionBehavior.mutateAsync({ routing_mode: routingMode });
              }}
              provider={activeProvider}
              routingMode={session?.routing_mode}
              state={state}
            />
          </div>
        </section>
      </ClioAppShell>
    </>
  );
}
