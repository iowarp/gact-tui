import type { RunState, WorkspaceReference } from '@clio/core/v3';
import { AnimatePresence, LayoutGroup, m } from 'motion/react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ClioAppShell } from '@/components/clio/app-shell';
import { ClioCommandMenu } from '@/components/clio/command-menu';
import { ClioMoreDetails } from '@/components/clio/more-details';
import { AttentionModeBanner } from '@/components/clio/attention-mode-banner';
import { AttentionLookupPanel } from '@/components/clio/attention-lookup-panel';
import { ClioComposer } from '@/components/clio/composer';
import { ClioChildSessionFooter } from '@/components/clio/child-session-footer';
import { ClioConversationWelcome } from '@/components/clio/conversation-welcome';
import { sessionPatchForMessageBehavior } from '@/components/clio/session-behavior-options';
import { ClioNavigation } from '@/components/clio/navigation';
import { ClioSessionContextBar } from '@/components/clio/session-context-bar';
import { ClioWorkbench } from '@/components/clio/workbench';
import {
  TranscriptPresenceSurface,
  WorkspaceHydrating,
  WorkspaceUnavailable,
  WorkspaceTranscriptAlerts,
  WorkspaceActionAlerts,
} from '@/components/clio/workspace-route-surfaces';
import * as workspaceRouteState from '@/components/clio/workspace-route-state';
import { QuestionAnswerContext } from '@/components/clio/question-answer-context';
import { useWorkspaceQuestions } from '@/components/clio/use-workspace-questions';
import {
  WorkspaceLiveConversation,
  WorkspaceLiveObservabilityDock,
  WorkspaceLiveObservabilityView,
  WorkspaceLiveStatusStrip,
} from '@/components/clio/workspace-live-projections';
import { useA2uiOpenArtifactRuntime } from '@/lib/a2ui/kernel-runtime';
import { useDashboardReviewOpening } from '@/hooks/use-dashboard-review-opening';
import { useA2uiCatalogRegistry } from '@/lib/a2ui/processor-store';
import { WorkspaceSessionProviders } from '@/components/clio/workspace-session-providers';
import { useRepository } from '@/hooks/use-repository';
import { useAttentionMode } from '@/hooks/use-attention-mode';
import { useSessionHistoryActions } from '@/hooks/use-session-history-actions';
import { useSessionDiffActions } from '@/hooks/use-session-diff-actions';
import { useSessionCommands } from '@/hooks/use-session-commands';
import { useSessionMutations } from '@/hooks/use-session-mutations';
import { useSessionMessageCount } from '@/hooks/use-session-message-count';
import { useWorkspaceData } from '@/hooks/use-workspace-data';
import { useComposerDraft } from '@/hooks/use-composer-draft';
import { useAddToChatSelectionAction } from '@/hooks/use-add-to-chat-selection-action';
import { useReferenceThisSelectionAction } from '@/hooks/use-reference-this-selection-action';
import { useWorkbenchNavigation } from '@/hooks/use-workbench-navigation';
import { useRequestedWorkflow } from '@/hooks/use-requested-workflow';
import { useContextTargetSelection } from '@/hooks/use-context-target-selection';
import { useWorkspaceNavigationActions } from '@/hooks/use-workspace-navigation-actions';
import { useWorkspaceTerminalActions } from '@/hooks/use-workspace-terminal-actions';
import { useConnectionSettings } from '@/providers/connection-provider';
import { buildSessionAttentionMap } from '@/lib/session-attention';
import { navigateComposerReferenceOrToast } from '@/lib/composer-reference-navigation';
import { isManagedChildSession, showsBaseAgent } from '@/lib/session-state';
import { useDesktopTitleSync } from '@/hooks/use-desktop-title-sync';
import { openExternalUrlOrToast } from '@/tauri/external-url';
import { useObservabilityNavigation } from '@/hooks/use-observability-navigation';

export function WorkspacePage() {
  const { workspaceId = '', sessionId = '' } = useParams();
  const showcaseSurfaceRef = useRef<HTMLElement>(null);
  const [searchParams] = useSearchParams();
  const { settings } = useConnectionSettings();
  const navigate = useNavigate();
  const repository = useRepository();
  const a2uiCatalog = useA2uiCatalogRegistry(sessionId);
  const composerDraft = useComposerDraft(sessionId, { persist: true, endpoint: settings.endpoint });
  const [composerFocusKey, setComposerFocusKey] = useState(0);
  const focusComposerForAnswer = useCallback(() => setComposerFocusKey((key) => key + 1), []);
  useAddToChatSelectionAction(composerDraft, focusComposerForAnswer);
  useReferenceThisSelectionAction(composerDraft, focusComposerForAnswer);
  const [dockedComposerHeight, setDockedComposerHeight] = useState(0);
  const [startedSessionId, setStartedSessionId] = useState<string | undefined>(undefined);
  // "Is the Files view currently the mounted tab" -- gates workspaceFiles'
  // poll (use-workspace-data.ts's refetchInterval) so it only runs while
  // someone could actually see a stale listing, not for every open session.
  const [filesViewActive, setFilesViewActive] = useState(false);
  const [contextTargetId, setContextTargetId] = useContextTargetSelection(sessionId);
  const sessionHistory = useSessionHistoryActions(sessionId, workspaceId);
  const diffActions = useSessionDiffActions();
  const { commands, isPending, run } = useSessionCommands(sessionId, workspaceId);
  const {
    activeBlueprint,
    activeEffort,
    configuredEffort,
    activeModel,
    activeProvider,
    attentionInteractions,
    agentBlueprints,
    allSessions,
    artifacts,
    artifactEvidence,
    capabilities,
    context,
    contextObservability,
    contextTargetOptions,
    entities,
    executionProvenance,
    interactions,
    interactionCapabilityError,
    interactionsError,
    interactionRootSessionId,
    interactionSessionIds,
    interactionSurfaces,
    refetchInteractionSurfaces,
    modelOptions,
    modelCatalogStatus,
    parentSession,
    providerCatalog,
    processes,
    runs,
    session,
    sessionLookupPending,
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
  } = useWorkspaceData({ contextTargetId, filesViewActive, sessionId, workspaceId });
  const navigationSessions = useMemo(
    () => allSessions.data ?? sessions.data ?? [],
    [allSessions.data, sessions.data],
  );
  const activeWorkspace = workspaces.data?.find((workspace) => workspace.id === workspaceId);
  const sessionAttentions = useMemo(
    () => buildSessionAttentionMap(navigationSessions, attentionInteractions),
    [attentionInteractions, navigationSessions],
  );
  const interactionOwnerLabels = useMemo(
    () =>
      workspaceRouteState.interactionOwnerLabels(
        interactions,
        interactionSessionIds,
        navigationSessions,
      ),
    [interactionSessionIds, interactions, navigationSessions],
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
  const attention = useAttentionMode(sessionId, transcript.data?.messages.length ?? 0);
  // messageCount lags transcript.isFetching by a render tick (it only
  // hydrates from transcript.data via use-workspace-data.ts's mergeSnapshots
  // effect), which used to flash the welcome variant -- remounting the
  // composer and dropping any in-progress attachment/draft -- for one render
  // per existing-conversation navigation. Gating also on transcript.data's
  // own count, which never disagrees with isFetching, closes the race.
  const showConversationWelcome =
    messageCount === 0 &&
    (transcript.data?.messages.length ?? 0) === 0 &&
    !transcript.isFetching &&
    !transcriptError &&
    !conversationStarted;

  const {
    activeRequest: workbenchRequest,
    openArtifact,
    openDiff,
    openSubagent,
    openWorkflow,
    openWorkspaceFile,
    openWorkspaceResource,
    revealWorkbench,
  } = useWorkbenchNavigation({ allSessions: allSessions.data ?? [], workspaceId });
  const { openObservability, requestedView } = useObservabilityNavigation(sessionId, () =>
    revealWorkbench({ kind: 'session' }),
  );
  const terminalActions = useWorkspaceTerminalActions(activeWorkspace?.path, revealWorkbench);
  useDesktopTitleSync({
    blueprint: activeBlueprint?.display_name,
    onOpenBlueprint: () =>
      activeBlueprint && revealWorkbench({ kind: 'blueprint', blueprint: activeBlueprint }),
    session: session?.title,
    showsBaseAgent: showsBaseAgent(session, activeBlueprint),
    workspace: activeWorkspace?.display_name,
  });
  useRequestedWorkflow(searchParams.get('workflow'), tools, openWorkflow);
  const workspaceResourceEntities = useMemo(
    () =>
      Object.fromEntries(
        (workspaceResources.data ?? []).map((resource) => [resource.id, resource]),
      ),
    [workspaceResources.data],
  );
  const openComposerReference = useCallback(
    async (reference: WorkspaceReference) => {
      await navigateComposerReferenceOrToast({
        artifacts,
        diffs: sessionObservability.diffs.data ?? [],
        openArtifact,
        openDiff,
        openExternal: openExternalUrlOrToast,
        openSession: (targetWorkspaceId, targetSessionId) =>
          void navigate(
            `/workspaces/${encodeURIComponent(targetWorkspaceId)}/sessions/${encodeURIComponent(targetSessionId)}`,
          ),
        openWorkspaceFile,
        openWorkspaceResource,
        reference,
        repository,
        resources: workspaceResourceEntities,
        revealSession: () => revealWorkbench({ kind: 'session' }),
        sessionId,
        workspaceId,
      });
    },
    [
      artifacts,
      navigate,
      openArtifact,
      openDiff,
      openWorkspaceFile,
      openWorkspaceResource,
      repository,
      revealWorkbench,
      sessionId,
      sessionObservability.diffs.data,
      workspaceId,
      workspaceResourceEntities,
    ],
  );
  useA2uiOpenArtifactRuntime(entities.artifacts, sessionId, openArtifact);
  useDashboardReviewOpening(
    entities.tools,
    entities.artifacts,
    sessionId,
    openArtifact,
    repository,
  );

  const {
    actionCard,
    cancel,
    cancelPendingSteer,
    deleteQueuedMessage,
    pendingSteers,
    promoteQueuedMessage,
    prepareFiles,
    discardFiles,
    queuedMessages,
    reorderQueuedMessages,
    respondInteraction,
    retry,
    send,
    updateQueuedMessage,
    updateSessionBehavior,
  } = useSessionMutations({
    openSubagent,
    activeModel,
    activeProvider,
    session,
    sessionId,
    workspaceId,
    interactionRootSessionId,
    supportsUnifiedInteractions,
  });
  const { handleInteractionResponse, questionAnswering, pendingInteractionsPanel } =
    useWorkspaceQuestions({
      interactions,
      tools,
      messages: transcript.data?.messages ?? [],
      sessionId,
      focusComposer: focusComposerForAnswer,
      respondInteraction: respondInteraction.mutateAsync,
      send: send.mutateAsync,
      tray: {
        actionLifecycles: entities.a2ui_action_lifecycles,
        capabilityError: interactionCapabilityError ?? undefined,
        error: interactionsError ?? undefined,
        onRefetchSurfaces: refetchInteractionSurfaces,
        ownerLabels: interactionOwnerLabels,
        surfaces: interactionSurfaces,
        viewedSessionId: sessionId,
      },
    });
  const { navigationActions } = useWorkspaceNavigationActions(workspaceId, sessionId);
  const queryError = capabilities.error ?? workspaces.error ?? sessions.error ?? transcript.error;
  if (
    !session &&
    (capabilities.isPending ||
      workspaces.isPending ||
      sessions.isPending ||
      allSessions.isPending ||
      sessionLookupPending)
  ) {
    const rememberedSession = navigationSessions.find((candidate) => candidate.id === sessionId);
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
            <div className="min-w-0 truncate text-sm font-medium">
              {rememberedSession?.title ?? 'Opening conversation'}
            </div>
          }
          statusStrip={
            <WorkspaceLiveStatusStrip
              activeWorkCount={workspaceRouteState.countActiveWork(runs, tasks, tools)}
              sessionId={sessionId}
            />
          }
          workbench={<div aria-label="Workspace canvas loading" className="h-full bg-background" />}
        >
          <WorkspaceHydrating />
        </ClioAppShell>
      </>
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

  const state: RunState =
    session.state === 'running' ? 'running' : send.isPending ? 'queued' : session.state;
  const { pendingMessageIds, cancellablePendingMessageIds } =
    workspaceRouteState.pendingSteerMessageIds(pendingSteers.data ?? []);
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
      {isManagedChildSession(session) ? (
        <ClioChildSessionFooter
          onHeightChange={variant === 'docked' ? setDockedComposerHeight : undefined}
          onReturnToParent={() =>
            navigate(
              `/workspaces/${encodeURIComponent(parentSession?.workspace_id ?? workspaceId)}/sessions/${encodeURIComponent(session.parent_session_id!)}`,
            )
          }
          parentTitle={parentSession?.title ?? 'Parent conversation'}
          pendingInteractions={pendingInteractionsPanel}
          state={state}
          variant={variant}
        />
      ) : (
        <ClioComposer
          catalogPreparing={a2uiCatalog.isLoading}
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
          configuredEffort={configuredEffort}
          executionMode={
            session.mode === 'plan'
              ? 'plan'
              : session.mode === 'architect'
                ? 'deep_research'
                : 'execute'
          }
          focusRequestKey={composerFocusKey}
          // Keyed on the session alone: provider/model/effort resolving after
          // navigation used to remount this whole subtree, silently dropping
          // in-progress attachments and other composer-local state. ClioComposer
          // reconciles those props into its own selection state (see
          // `modelSelection`/`behaviorSelection`) instead of needing a remount.
          key={`composer:${sessionId}`}
          model={activeModel}
          modelCatalogStatus={modelCatalogStatus}
          modelOptions={modelOptions}
          pendingInteractions={pendingInteractionsPanel}
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
          onRetryModelCatalog={(providerId) => void providerCatalog.refreshCatalog(providerId)}
          onBehaviorChange={async (behavior) => {
            await updateSessionBehavior.mutateAsync(sessionPatchForMessageBehavior(behavior));
          }}
          onPrepareFiles={prepareFiles}
          onDiscardFiles={discardFiles}
          onHeightChange={variant === 'docked' ? setDockedComposerHeight : undefined}
          onSubmit={async (value) => {
            const startedFromWelcome = showConversationWelcome;
            if (startedFromWelcome) setConversationStarted(true);
            try {
              await questionAnswering.submit(value);
            } catch (error) {
              if (startedFromWelcome && messageCount === 0) setConversationStarted(false);
              throw error;
            }
          }}
          onStop={() => cancel.mutate()}
          onOpenResource={openWorkspaceResource}
          onOpenReference={(reference) => void openComposerReference(reference)}
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
          annotations={composerDraft.annotations}
          onAnnotationsChange={composerDraft.onAnnotationsChange}
          onReferencesChange={composerDraft.onReferencesChange}
          onValueChange={composerDraft.onValueChange}
          provider={activeProvider}
          queuedMessages={queuedMessages.data ?? []}
          queuePaused={session?.metadata?.composer_queue_paused === true}
          resources={workspaceResources.data ?? []}
          queueBusy={
            deleteQueuedMessage.isPending ||
            promoteQueuedMessage.isPending ||
            reorderQueuedMessages.isPending ||
            updateQueuedMessage.isPending
          }
          state={state}
          references={composerDraft.references}
          value={composerDraft.value}
          variant={variant}
          workspaceId={workspaceId}
        />
      )}
    </m.div>
  );
  return (
    <WorkspaceSessionProviders workspaceId={workspaceId} sessionId={sessionId}>
      <QuestionAnswerContext.Provider value={questionAnswering.context}>
        <ClioCommandMenu onOpenResource={revealWorkbench} />
        <ClioMoreDetails
          composerDraft={composerDraft}
          focusComposer={() => setComposerFocusKey((key) => key + 1)}
          model={activeModel}
          provider={activeProvider}
          sessionId={sessionId}
          workspaceId={workspaceId}
        />
        <ClioAppShell
          toolbarActions={
            <WorkspaceLiveObservabilityDock
              toolbar
              surfaceRef={showcaseSurfaceRef}
              workspaceId={workspaceId}
              artifacts={artifacts}
              context={context}
              contextFiles={sessionObservability.contextFiles.data ?? []}
              contextFrames={sessionObservability.contextFrames.data ?? []}
              diffs={sessionObservability.diffs.data ?? []}
              executionProvenance={executionProvenance.execution.data}
              interactions={interactions}
              onOpenCanvas={openObservability}
              onOpenWork={() => revealWorkbench({ kind: 'resources', section: 'work' })}
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
          }
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
              management={
                session
                  ? { session, actions: navigationActions, endpoint: settings.endpoint }
                  : undefined
              }
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
              onOpenSystemTerminal={terminalActions.onOpenSystemTerminal}
              onReturnToParent={(parent) =>
                navigate(
                  `/workspaces/${encodeURIComponent(parent.workspace_id)}/sessions/${encodeURIComponent(parent.id)}`,
                )
              }
              onShare={async (ttlSeconds) =>
                (await sessionHistory.share.mutateAsync(ttlSeconds)).url
              }
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
              files={workspaceFiles.data?.entries ?? []}
              filesError={workspaceFiles.error?.message}
              filesFetching={workspaceFiles.isFetching}
              filesPending={workspaceFiles.isPending}
              filesTruncated={workspaceFiles.data?.truncated ?? false}
              filesNextOffset={workspaceFiles.data?.next_offset}
              onFilesViewActiveChange={setFilesViewActive}
              onRefreshFiles={() => void workspaceFiles.refetch()}
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
              onOpenTerminal={terminalActions.onOpenTerminal}
              onOpenSubagent={openSubagent}
              subagents={subagents}
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
                  requestedView={requestedView}
                  artifacts={artifactEvidence}
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
                  compactContextPending={sessionContext.compactPending}
                  diffs={sessionObservability.diffs.data ?? []}
                  diffsError={sessionObservability.diffs.error?.message}
                  diffsPending={sessionObservability.diffs.isPending}
                  processesError={sessionObservability.processes.error?.message}
                  processesPending={sessionObservability.processes.isPending}
                  executionProvenance={executionProvenance.execution.data}
                  interactions={interactions}
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
                    executionProvenance.providers.isPending ||
                    executionProvenance.execution.isPending
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
              sessionId={sessionId}
              sessionState={session?.state}
            />
          }
        >
          <section
            ref={showcaseSurfaceRef}
            data-slot="session-transcript"
            className="relative flex h-full min-w-0 flex-col bg-background"
          >
            <WorkspaceTranscriptAlerts
              sessionFailed={
                session?.state === 'failed' &&
                transcript.data?.messages.at(-1)?.stop_reason !== 'error'
              }
              streamError={streamError}
              transcriptError={messageCount > 0 ? transcriptError : undefined}
            />
            <AttentionModeBanner
              onDismiss={attention.dismiss}
              state={attention.state}
              onProfileChange={attention.changeProfile}
            />
            <AttentionLookupPanel sessionId={sessionId} onHeatChange={attention.showLookupHeat} />
            <LayoutGroup id={`session-layout:${sessionId}`}>
              <AnimatePresence initial={false} mode="popLayout">
                {showConversationWelcome ? (
                  <TranscriptPresenceSurface
                    className="clio-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6"
                    key="welcome"
                  >
                    <div className="flex min-h-full items-center">
                      <ClioConversationWelcome
                        disabled={!session || send.isPending || cancel.isPending || isPending}
                        onSelectPrompt={(prompt) => {
                          composerDraft.onValueChange(prompt);
                          setComposerFocusKey((current) => current + 1);
                        }}
                      >
                        {renderComposer('welcome')}
                      </ClioConversationWelcome>
                    </div>
                  </TranscriptPresenceSurface>
                ) : (
                  <TranscriptPresenceSurface className="min-h-0 flex-1" key="conversation">
                    <WorkspaceLiveConversation
                      artifacts={artifacts}
                      attentionData={attention.heat}
                      bottomInset={dockedComposerHeight}
                      error={transcriptError}
                      loading={transcript.isFetching}
                      onActionCardAction={actionCard.mutateAsync}
                      onOpenArtifact={openArtifact}
                      onOpenFile={openWorkspaceFile}
                      onOpenWork={() => revealWorkbench({ kind: 'resources', section: 'work' })}
                      onOpenResource={openWorkspaceResource}
                      onOpenReference={(reference) => void openComposerReference(reference)}
                      onInteractionResponse={handleInteractionResponse}
                      forkingMessageId={
                        sessionHistory.fork.isPending && sessionHistory.fork.variables
                          ? sessionHistory.fork.variables
                          : undefined
                      }
                      onForkFromMessage={sessionHistory.fork.mutateAsync}
                      onOpenSubagent={openSubagent}
                      onOpenWorkflow={openWorkflow}
                      onRewindToMessage={sessionHistory.rewind.mutateAsync}
                      onRetryMessage={retry.mutateAsync}
                      cancellablePendingMessageIds={cancellablePendingMessageIds}
                      cancellingPendingMessageId={
                        cancelPendingSteer.isPending ? cancelPendingSteer.variables : undefined
                      }
                      onCancelPendingSteer={cancelPendingSteer.mutateAsync}
                      pendingMessageIds={pendingMessageIds}
                      rewindingMessageId={
                        sessionHistory.rewind.isPending
                          ? sessionHistory.rewind.variables
                          : undefined
                      }
                      retryingMessageId={retry.isPending ? retry.variables : undefined}
                      resources={workspaceResourceEntities}
                      mcpAppRepository={repository}
                      interactions={interactions}
                      sessionId={sessionId}
                      subagents={subagents}
                      sessionState={state}
                      workspaceId={workspaceId}
                    />
                  </TranscriptPresenceSurface>
                )}
              </AnimatePresence>
              <WorkspaceActionAlerts
                actionError={actionCard.error?.message}
                retryError={retry.error?.message}
              />
              <AnimatePresence initial={false}>
                {showConversationWelcome ? null : renderComposer('docked')}
              </AnimatePresence>
            </LayoutGroup>
          </section>
        </ClioAppShell>
      </QuestionAnswerContext.Provider>
    </WorkspaceSessionProviders>
  );
}
