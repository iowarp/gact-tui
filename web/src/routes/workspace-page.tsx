import { queryKeys } from '@/lib/query-keys';
import type { RunState } from '@clio/core/v3';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon } from 'lucide-react';
import { AnimatePresence, LayoutGroup, m } from 'motion/react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ClioAppShell } from '@/components/clio/app-shell';
import { ClioCommandMenu } from '@/components/clio/command-menu';
import { ClioComposer } from '@/components/clio/composer';
import { ClioConversationWelcome } from '@/components/clio/conversation-welcome';
import { ClioNavigation } from '@/components/clio/navigation';
import type { ResourceActions } from '@/components/clio/resource-dialogs';
import { ClioPendingInteractions } from '@/components/clio/pending-interactions';
import { ClioSessionContextBar } from '@/components/clio/session-context-bar';
import { ClioWorkbench } from '@/components/clio/workbench';
import { WorkspaceLoading, WorkspaceUnavailable } from '@/components/clio/workspace-route-surfaces';
import * as workspaceRouteState from '@/components/clio/workspace-route-state';
import {
  WorkspaceLiveConversation,
  WorkspaceLiveInfrastructurePreparation,
  WorkspaceLiveObservabilityDock,
  WorkspaceLiveObservabilityView,
  WorkspaceLiveStatusStrip,
} from '@/components/clio/workspace-live-projections';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useA2UILocalActions } from '@/hooks/use-a2ui-local-actions';
import { useRepository } from '@/hooks/use-repository';
import { useSessionHistoryActions } from '@/hooks/use-session-history-actions';
import { useSessionDiffActions } from '@/hooks/use-session-diff-actions';
import { useSessionCommands } from '@/hooks/use-session-commands';
import { useSessionMutations } from '@/hooks/use-session-mutations';
import { useSessionMessageCount } from '@/hooks/use-session-message-count';
import { useWorkspaceData } from '@/hooks/use-workspace-data';
import { useWorkbenchNavigation } from '@/hooks/use-workbench-navigation';
import { useAvailableSessionNavigation } from '@/hooks/use-available-session-navigation';
import { useContextTargetSelection } from '@/hooks/use-context-target-selection';
import { useConnectionSettings } from '@/providers/connection-provider';
import { buildSessionAttentionMap } from '@/lib/session-attention';

export function WorkspacePage() {
  const { workspaceId = '', sessionId = '' } = useParams();
  const { settings } = useConnectionSettings();
  const navigate = useNavigate();
  const navigateToAvailableSession = useAvailableSessionNavigation();
  const repository = useRepository();
  const queryClient = useQueryClient();
  const [composerDraftState, setComposerDraftState] = useState({ sessionId, value: '' });
  const composerDraft = composerDraftState.sessionId === sessionId ? composerDraftState.value : '';
  const setComposerDraft = useCallback(
    (value: string) => setComposerDraftState({ sessionId, value }),
    [sessionId],
  );
  const [composerFocusKey, setComposerFocusKey] = useState(0);
  const [dockedComposerHeight, setDockedComposerHeight] = useState(0);
  const [startedSessionId, setStartedSessionId] = useState<string | undefined>(undefined);
  const [contextTargetId, setContextTargetId] = useContextTargetSelection(sessionId);
  const sessionHistory = useSessionHistoryActions(sessionId, workspaceId);
  const diffActions = useSessionDiffActions();
  const { commands, isPending, run } = useSessionCommands(sessionId, workspaceId);
  const {
    activeBlueprint,
    activeEffort,
    activeModel,
    activeProvider,
    attentionInteractions,
    agentBlueprints,
    allSessions,
    artifacts,
    capabilities,
    context,
    contextObservability,
    contextTargetOptions,
    entities,
    executionProvenance,
    interactions,
    interactionsError,
    interactionRootSessionId,
    interactionSurfaces,
    modelOptions,
    modelCatalogStatus,
    parentSession,
    providerCatalog,
    processes,
    runs,
    session,
    sessionArtifacts,
    sessionContext,
    sessionObservability,
    sessions,
    streamError,
    subagents,
    tasks,
    tools,
    transcript,
    transcriptError,
    supportsUnifiedInteractions,
    workspaceFiles,
    workspaceResources,
    workspaces,
  } = useWorkspaceData({ contextTargetId, sessionId, workspaceId });
  const navigationSessions = useMemo(
    () => allSessions.data ?? sessions.data ?? [],
    [allSessions.data, sessions.data],
  );
  const sessionAttentions = useMemo(
    () => buildSessionAttentionMap(navigationSessions, attentionInteractions),
    [attentionInteractions, navigationSessions],
  );
  const interactionOwnerLabels = useMemo(
    () =>
      Object.fromEntries(
        interactions.map((interaction) => {
          const owner = navigationSessions.find(
            (candidate) => candidate.id === interaction.owner_session_id,
          );
          return [interaction.owner_session_id, owner?.title ?? 'Specialist'];
        }),
      ),
    [interactions, navigationSessions],
  );
  const messageCount = useSessionMessageCount(sessionId);
  const conversationStarted = messageCount > 0 || startedSessionId === sessionId;
  const setConversationStarted = useCallback(
    (started: boolean) =>
      setStartedSessionId((current) =>
        started ? sessionId : current === sessionId ? undefined : current,
      ),
    [sessionId],
  );
  const showConversationWelcome =
    messageCount === 0 && !transcript.isPending && !transcriptError && !conversationStarted;

  const {
    activeRequest: workbenchRequest,
    openArtifact,
    openDiff,
    openSubagent,
    openWorkspaceFile,
    openWorkspaceResource,
    revealWorkbench,
  } = useWorkbenchNavigation({ allSessions: allSessions.data ?? [], workspaceId });
  const workspaceResourceEntities = useMemo(
    () =>
      Object.fromEntries(
        (workspaceResources.data ?? []).map((resource) => [resource.id, resource]),
      ),
    [workspaceResources.data],
  );
  const handleA2UILocalAction = useA2UILocalActions(entities.artifacts, sessionId, openArtifact);

  const {
    actionCard,
    cancel,
    cancelPendingSteer,
    deleteQueuedMessage,
    pendingSteers,
    promoteQueuedMessage,
    queuedMessages,
    reorderQueuedMessages,
    respondInteraction,
    retry,
    send,
    updateQueuedMessage,
  } = useSessionMutations({
    activeModel,
    activeProvider,
    session,
    sessionId,
    workspaceId,
    interactionRootSessionId,
    supportsUnifiedInteractions,
  });
  const refreshNavigation = useCallback(
    async (targetWorkspaceId = workspaceId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.key('workspaces', settings.endpoint) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('sessions', settings.endpoint, 'all'),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('sessions', settings.endpoint, targetWorkspaceId),
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
  const queryError = capabilities.error ?? workspaces.error ?? sessions.error ?? transcript.error;
  if (
    !session &&
    (capabilities.isPending || workspaces.isPending || sessions.isPending || allSessions.isPending)
  ) {
    return <WorkspaceLoading />;
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

  const state: RunState =
    session.state === 'running' ? 'running' : send.isPending ? 'queued' : session.state;
  const pendingMessageIds = new Set(
    (pendingSteers.data ?? [])
      .filter((steer) => steer.state === 'pending' || steer.state === 'claimed')
      .map((steer) => steer.message_id),
  );
  const cancellablePendingMessageIds = new Set(
    (pendingSteers.data ?? [])
      .filter((steer) => steer.state === 'pending')
      .map((steer) => steer.message_id),
  );
  const activeWorkCount = workspaceRouteState.countActiveWork(runs, tasks, tools);
  const renderComposer = (variant: 'docked' | 'welcome') => (
    <m.div
      className={
        variant === 'welcome'
          ? 'w-full'
          : 'pointer-events-none absolute inset-0 z-20 flex min-h-0 flex-col justify-end'
      }
      key={variant}
      layout
      layoutId={`session-composer:${sessionId}`}
    >
      <WorkspaceLiveInfrastructurePreparation sessionId={sessionId} />
      <ClioComposer
        activityControl={
          variant === 'docked' ? (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <WorkspaceLiveObservabilityDock
                artifacts={artifacts}
                context={context}
                contextFiles={sessionObservability.contextFiles.data ?? []}
                contextFrames={sessionObservability.contextFrames.data ?? []}
                diffs={sessionObservability.diffs.data ?? []}
                executionProvenance={executionProvenance.execution.data}
                onOpenCanvas={() => revealWorkbench({ kind: 'session' })}
                onOpenArtifact={openArtifact}
                onOpenDiff={openDiff}
                onOpenFile={openWorkspaceFile}
                onOpenResource={openWorkspaceResource}
                onOpenSubagent={openSubagent}
                onProvenanceProviderChange={executionProvenance.setProvider}
                processes={processes}
                resources={workspaceResources.data ?? []}
                provenanceDegradation={executionProvenance.degradation}
                provenancePending={
                  executionProvenance.providers.isPending || executionProvenance.execution.isPending
                }
                provenanceProvider={executionProvenance.provider}
                provenanceProviders={executionProvenance.providers.data?.providers}
                artifactProvenanceProvider={executionProvenance.providers.data?.artifact}
                runs={runs}
                sessionId={sessionId}
                sessionState={state}
                subagents={subagents}
                tasks={tasks}
                tools={tools}
              />
            </div>
          ) : undefined
        }
        attachments={workspaceRouteState.canUploadWorkspaceResources(
          capabilities.data?.capabilities,
        )}
        contextReferences={workspaceRouteState.canUseContextReferences(
          capabilities.data?.capabilities,
        )}
        commands={commands}
        confirmationPolicy={session.approval_mode === 'unknown' ? 'ask' : session.approval_mode}
        disabled={!session || send.isPending || cancel.isPending || isPending}
        effort={activeEffort}
        executionMode={
          session.mode === 'plan'
            ? 'plan'
            : session.mode === 'architect'
              ? 'deep_research'
              : 'execute'
        }
        focusRequestKey={composerFocusKey}
        key={`composer:${activeProvider ?? ''}:${activeModel ?? ''}:${activeEffort ?? ''}`}
        model={activeModel}
        modelCatalogStatus={modelCatalogStatus}
        modelOptions={modelOptions}
        pendingInteractions={
          <ClioPendingInteractions
            disabled={respondInteraction.isPending}
            interactions={interactions}
            onA2UILocalAction={handleA2UILocalAction}
            onResponse={async (interaction, response) => {
              await respondInteraction.mutateAsync({ interaction, response });
            }}
            ownerLabels={interactionOwnerLabels}
            surfaces={interactionSurfaces}
          />
        }
        onCommand={async (value) => {
          const startedFromWelcome = showConversationWelcome;
          if (startedFromWelcome) setConversationStarted(true);
          try {
            await run(value);
          } catch (error) {
            if (startedFromWelcome && messageCount === 0) setConversationStarted(false);
            throw error;
          }
        }}
        onRetryModelCatalog={() => {
          void providerCatalog.refetch();
        }}
        onHeightChange={variant === 'docked' ? setDockedComposerHeight : undefined}
        onSubmit={async (value) => {
          const startedFromWelcome = showConversationWelcome;
          if (startedFromWelcome) setConversationStarted(true);
          try {
            await send.mutateAsync(value);
          } catch (error) {
            if (startedFromWelcome && messageCount === 0) setConversationStarted(false);
            throw error;
          }
        }}
        onStop={() => cancel.mutate()}
        onOpenResource={openWorkspaceResource}
        onDeleteQueuedMessage={(message) => deleteQueuedMessage.mutateAsync(message)}
        onPromoteQueuedMessage={(message, delivery) =>
          promoteQueuedMessage.mutateAsync({ delivery, message }).then(() => undefined)
        }
        onReorderQueuedMessages={(messages) =>
          reorderQueuedMessages.mutateAsync(messages).then(() => undefined)
        }
        onUpdateQueuedMessage={(message, text) =>
          updateQueuedMessage.mutateAsync({ message, text }).then(() => undefined)
        }
        onValueChange={setComposerDraft}
        provider={activeProvider}
        queuedMessages={queuedMessages.data ?? []}
        resources={workspaceResources.data ?? []}
        queueBusy={
          deleteQueuedMessage.isPending ||
          promoteQueuedMessage.isPending ||
          reorderQueuedMessages.isPending ||
          updateQueuedMessage.isPending
        }
        state={state}
        value={composerDraft}
        variant={variant}
        workspaceId={workspaceId}
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
            attentions={sessionAttentions}
            blueprints={agentBlueprints.data ?? []}
            endpoint={settings.endpoint}
            onOpenWorkspaceFiles={() => revealWorkbench({ kind: 'resources', section: 'files' })}
            sessions={navigationSessions}
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
              sessionHistory.share.isPending
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
            resources={workspaceResources.data ?? []}
            resourcesError={workspaceResources.error?.message}
            resourcesPending={workspaceResources.isPending}
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
            requestedOpen={workbenchRequest}
            sessionId={sessionId}
            sessionView={
              <WorkspaceLiveObservabilityView
                artifacts={artifacts}
                artifactProvenanceProvider={executionProvenance.providers.data?.artifact}
                context={context}
                contextError={sessionContext.state.error?.message}
                contextFiles={contextObservability.contextFiles.data ?? []}
                contextFilesError={contextObservability.contextFiles.error?.message}
                contextFilesPending={contextObservability.contextFiles.isPending}
                contextFrames={contextObservability.contextFrames.data ?? []}
                contextFramesError={contextObservability.contextFrames.error?.message}
                contextFramesPending={contextObservability.contextFrames.isPending}
                contextPreferencesPending={sessionContext.preferences.isPending}
                contextTargets={contextTargetOptions}
                compactContextPending={sessionContext.compact.isPending}
                diffs={sessionObservability.diffs.data ?? []}
                diffsError={sessionObservability.diffs.error?.message}
                diffsPending={sessionObservability.diffs.isPending}
                processesError={sessionObservability.processes.error?.message}
                processesPending={sessionObservability.processes.isPending}
                executionProvenance={executionProvenance.execution.data}
                onOpenArtifact={openArtifact}
                onOpenDiff={openDiff}
                onOpenFile={openWorkspaceFile}
                onOpenResource={openWorkspaceResource}
                onOpenSubagent={openSubagent}
                onCompactContext={() => sessionContext.compact.mutateAsync()}
                onContextTargetChange={setContextTargetId}
                onProvenanceProviderChange={executionProvenance.setProvider}
                onUpdateContextPreferences={(input) =>
                  sessionContext.preferences.mutateAsync(input)
                }
                processes={processes}
                resources={workspaceResources.data ?? []}
                provenanceDegradation={executionProvenance.degradation}
                provenancePending={
                  executionProvenance.providers.isPending || executionProvenance.execution.isPending
                }
                provenanceProvider={executionProvenance.provider}
                provenanceProviders={executionProvenance.providers.data?.providers}
                runs={runs}
                sessionId={sessionId}
                subagents={subagents}
                selectedContextTargetId={contextTargetId}
                tasks={tasks}
                tools={tools}
              />
            }
            workspaceId={workspaceId}
          />
        }
        workbenchRevealKey={workbenchRequest?.key}
        statusStrip={
          <WorkspaceLiveStatusStrip
            activeWorkCount={activeWorkCount}
            a2uiVersions={capabilities.data?.a2ui_versions}
            gactVersions={capabilities.data?.gact_versions}
            service={capabilities.data?.service}
            sessionId={sessionId}
            sessionState={session?.state}
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
          {transcriptError && messageCount > 0 ? (
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
                  <WorkspaceLiveConversation
                    bottomInset={dockedComposerHeight}
                    error={transcriptError}
                    loading={transcript.isPending}
                    onActionCardAction={actionCard.mutateAsync}
                    onA2UILocalAction={handleA2UILocalAction}
                    onOpenArtifact={openArtifact}
                    onOpenFile={openWorkspaceFile}
                    onOpenResource={openWorkspaceResource}
                    forkingMessageId={
                      sessionHistory.fork.isPending && sessionHistory.fork.variables
                        ? sessionHistory.fork.variables
                        : undefined
                    }
                    onForkFromMessage={sessionHistory.fork.mutateAsync}
                    onOpenSubagent={openSubagent}
                    onRewindToMessage={sessionHistory.rewind.mutateAsync}
                    onRetryMessage={retry.mutateAsync}
                    cancellablePendingMessageIds={cancellablePendingMessageIds}
                    cancellingPendingMessageId={
                      cancelPendingSteer.isPending ? cancelPendingSteer.variables : undefined
                    }
                    onCancelPendingSteer={cancelPendingSteer.mutateAsync}
                    pendingMessageIds={pendingMessageIds}
                    rewindingMessageId={
                      sessionHistory.rewind.isPending ? sessionHistory.rewind.variables : undefined
                    }
                    retryingMessageId={retry.isPending ? retry.variables : undefined}
                    resources={workspaceResourceEntities}
                    sessionId={sessionId}
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
            {interactionsError || respondInteraction.error ? (
              <Alert className="mx-4 mb-3" variant="destructive">
                <AlertTriangleIcon aria-hidden="true" />
                <AlertTitle>Responses unavailable</AlertTitle>
                <AlertDescription>
                  {(interactionsError ?? respondInteraction.error)?.message}
                </AlertDescription>
              </Alert>
            ) : null}
            <AnimatePresence initial={false}>
              {showConversationWelcome ? null : renderComposer('docked')}
            </AnimatePresence>
          </LayoutGroup>
        </section>
      </ClioAppShell>
    </>
  );
}
