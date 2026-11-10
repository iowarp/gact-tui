import type { RunState, WorkspaceReference } from '@clio/core/v3';
import type { ObservabilityView } from '@/components/clio/observability-view-storage';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ClioAppShell } from '@/components/clio/app-shell';
import { ClioCommandMenu } from '@/components/clio/command-menu';
import { ClioMoreDetails } from '@/components/clio/more-details';
import { ClioNavigation } from '@/components/clio/navigation';
import { listState } from '@/lib/list-state';
import { WorkspaceComposer } from '@/components/clio/workspace-composer';
import { WorkspaceContextBar } from '@/components/clio/workspace-context-bar';
import { WorkspaceObservabilityDock } from '@/components/clio/workspace-observability';
import { WorkspaceTranscript } from '@/components/clio/workspace-transcript';
import { WorkspaceWorkbench } from '@/components/clio/workspace-workbench';
import {
  WorkspaceHydrating,
  WorkspaceUnavailable,
} from '@/components/clio/workspace-route-surfaces';
import * as workspaceRouteState from '@/components/clio/workspace-route-state';
import { QuestionAnswerContext } from '@/components/clio/question-answer-context';
import { useWorkspaceQuestions } from '@/components/clio/use-workspace-questions';
import { WorkspaceLiveStatusStrip } from '@/components/clio/workspace-live-projections';
import { useA2uiOpenArtifactRuntime } from '@/lib/a2ui/kernel-runtime';
import { useOpenViewRuntime } from '@/hooks/use-open-view-runtime';
import { useDashboardReviewOpening } from '@/hooks/use-dashboard-review-opening';
import { useA2uiCatalogRegistry } from '@/lib/a2ui/processor-store';
import { WorkspaceSessionProviders } from '@/components/clio/workspace-session-providers';
import { useRepository } from '@/hooks/use-repository';
import { useAttentionMode } from '@/hooks/use-attention-mode';
import { useComposerReferenceNavigation } from '@/hooks/use-composer-reference-navigation';
import { useSessionHistoryActions } from '@/hooks/use-session-history-actions';
import { useSessionDiffActions } from '@/hooks/use-session-diff-actions';
import { useSessionCommands } from '@/hooks/use-session-commands';
import { useScienceLog } from '@/hooks/use-science-log';
import { useSessionMutations } from '@/hooks/use-session-mutations';
import { useSessionMessageCount } from '@/hooks/use-session-message-count';
import { useWorkspaceData } from '@/hooks/use-workspace-data';
import { useQueryFetching } from '@/lib/query-notify';
import { useComposerDraft } from '@/hooks/use-composer-draft';
import { useAddToChatSelectionAction } from '@/hooks/use-add-to-chat-selection-action';
import { useReferenceThisSelectionAction } from '@/hooks/use-reference-this-selection-action';
import { useWorkbenchNavigation } from '@/hooks/use-workbench-navigation';
import { useKnowledgeAttachment } from '@/hooks/use-knowledge-attachment';
import { useWorkspaceResourceMap } from '@/hooks/use-workspace-resource-map';
import { useRequestedFlow } from '@/hooks/use-requested-flow';
import { useContextTargetSelection } from '@/hooks/use-context-target-selection';
import { useWorkspaceNavigationActions } from '@/hooks/use-workspace-navigation-actions';
import { useWorkspaceTerminalActions } from '@/hooks/use-workspace-terminal-actions';
import { useConnectionSettings } from '@/providers/connection-provider';
import { buildSessionAttentionMap } from '@/lib/session-attention';
import { workspaceName } from '@/lib/workspace-labels';
import { useObservabilityNavigation } from '@/hooks/use-observability-navigation';
import { useSpotterQuarantine } from '@/hooks/use-spotter-quarantine';

/**
 * One session in its workspace: loads the session's data and runtimes, then
 * composes the shell from parts that each own one region (navigation, context
 * bar, observability dock, workbench, transcript and message box).
 */
export function WorkspacePage() {
  const { workspaceId = '', sessionId = '' } = useParams();
  const showcaseSurfaceRef = useRef<HTMLElement>(null);
  const [searchParams] = useSearchParams();
  const { settings } = useConnectionSettings();
  const repository = useRepository();
  const a2uiCatalog = useA2uiCatalogRegistry(sessionId);
  const composerDraft = useComposerDraft(sessionId, { persist: true, endpoint: settings.endpoint });
  useKnowledgeAttachment(workspaceId, composerDraft);
  const [composerFocusKey, setComposerFocusKey] = useState(0);
  const focusComposerForAnswer = useCallback(() => setComposerFocusKey((key) => key + 1), []);
  useAddToChatSelectionAction(composerDraft, focusComposerForAnswer);
  useReferenceThisSelectionAction(composerDraft, focusComposerForAnswer);
  const [dockedComposerHeight, setDockedComposerHeight] = useState(0);
  const [startedSessionId, setStartedSessionId] = useState<string | undefined>(undefined);
  // Whether the Files tab is mounted: gates workspaceFiles' poll (use-workspace-data.ts)
  // to when someone could see a stale listing, not every open session.
  const [filesViewActive, setFilesViewActive] = useState(false);
  const [contextTargetId, setContextTargetId] = useContextTargetSelection(sessionId);
  const sessionHistory = useSessionHistoryActions(sessionId, workspaceId);
  const diffActions = useSessionDiffActions();
  const sessionCommands = useSessionCommands(sessionId, workspaceId);
  const data = useWorkspaceData({ contextTargetId, filesViewActive, sessionId, workspaceId });
  const {
    allSessions,
    attentionInteractions,
    capabilities,
    entities,
    installedAgents,
    interactions,
    interactionSessionIds,
    session,
    sessionLookupPending,
    sessions,
    transcript,
    transcriptError,
    workspaces,
  } = data;
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
  const transcriptDamaged = workspaceRouteState.conversationDamaged(transcript.error);
  const conversationStarted = messageCount > 0 || startedSessionId === sessionId;
  const setConversationStarted = useCallback(
    (started: boolean) =>
      setStartedSessionId((current) =>
        started ? sessionId : current === sessionId ? undefined : current,
      ),
    [sessionId],
  );
  const attention = useAttentionMode(sessionId, transcript.data?.messages.length ?? 0);
  // Hydration can lag messageCount by a render. Check both to avoid remounting
  // the welcome composer and losing drafts or attachments during navigation.
  const welcomeCandidate =
    messageCount === 0 &&
    (transcript.data?.messages.length ?? 0) === 0 &&
    !transcriptError &&
    !conversationStarted;
  // Read at render for the first fetch; the leaf subscription catches later flips
  // without re-rendering the page for a populated session's background refetches.
  const transcriptFetching = useQueryFetching(data.transcriptKey, welcomeCandidate);
  const showConversationWelcome = welcomeCandidate && !transcript.isFetching && !transcriptFetching;

  const workbench = useWorkbenchNavigation({ allSessions: allSessions.data ?? [], workspaceId });
  const { openArtifact, openFlow, openSubagent, revealWorkbench } = workbench;
  const revealSessionView = useCallback(
    (view?: ObservabilityView) => revealWorkbench({ kind: 'session', view }),
    [revealWorkbench],
  );
  const { openObservability, requestedView } = useObservabilityNavigation(
    sessionId,
    revealSessionView,
  );
  const openTasks = useCallback(() => openObservability(), [openObservability]);
  const terminalActions = useWorkspaceTerminalActions(activeWorkspace?.path, revealWorkbench);
  const inStudy = useScienceLog(sessionId).data?.in_study;
  const openWork = useCallback(
    () => revealWorkbench({ kind: 'resources', section: 'work' }),
    [revealWorkbench],
  );
  useRequestedFlow(searchParams.get('flow'), openFlow);
  const workspaceResourceEntities = useWorkspaceResourceMap(data.workspaceResources.data);
  const openComposerReference = useComposerReferenceNavigation({
    artifacts: data.artifacts,
    diffs: data.sessionObservability.diffs.data,
    navigation: workbench,
    resources: workspaceResourceEntities,
    sessionId,
    workspaceId,
  });
  // Stable, so a page render does not re-render every memoized transcript row.
  // The navigation closes over artifacts and diffs that change while a reply
  // streams; read the latest at click time instead of re-creating the callback.
  const openComposerReferenceRef = useRef(openComposerReference);
  useLayoutEffect(() => {
    openComposerReferenceRef.current = openComposerReference;
  }, [openComposerReference]);
  const openReference = useCallback(
    (reference: WorkspaceReference) => void openComposerReferenceRef.current(reference),
    [],
  );
  useA2uiOpenArtifactRuntime(entities.artifacts, sessionId, openArtifact);
  useOpenViewRuntime(repository, sessionId, openArtifact, revealWorkbench);
  useDashboardReviewOpening(
    entities.tools,
    entities.artifacts,
    sessionId,
    openArtifact,
    repository,
  );

  const mutations = useSessionMutations({
    openSubagent,
    activeModel: data.activeModel,
    activeProvider: data.activeProvider,
    session,
    sessionId,
    workspaceId,
    interactionRootSessionId: data.interactionRootSessionId,
    supportsUnifiedInteractions: data.supportsUnifiedInteractions,
  });
  const hold = useSpotterQuarantine(session, mutations.actionCard.mutateAsync);
  const { handleInteractionResponse, questionAnswering, pendingInteractionsPanel } =
    useWorkspaceQuestions({
      interactions,
      tools: data.tools,
      messages: transcript.data?.messages ?? [],
      sessionId,
      endpoint: settings.endpoint,
      focusComposer: focusComposerForAnswer,
      respondInteraction: mutations.respondInteraction.mutateAsync,
      send: mutations.sendMessage,
      revealSurfaceOwner: workbench.revealSurfaceOwner,
      tray: {
        actionLifecycles: entities.a2ui_action_lifecycles,
        artifacts: entities.artifacts,
        onOpenArtifact: openArtifact,
        onFocusComposer: focusComposerForAnswer,
        capabilityError: data.interactionCapabilityError ?? undefined,
        error: data.interactionsError ?? undefined,
        onRefetchSurfaces: data.refetchInteractionSurfaces,
        onOpenScript: (interaction, callId) =>
          revealWorkbench({
            kind: 'tool-call',
            callId,
            sessionId: interaction.owner_session_id,
            label: 'Script',
          }),
        ownerLabels: interactionOwnerLabels,
        surfaces: data.interactionSurfaces,
        viewedSessionId: sessionId,
      },
    });
  const { navigationActions } = useWorkspaceNavigationActions(workspaceId, sessionId);
  const work = { runs: data.runs, tasks: data.tasks, tools: data.tools, processes: data.processes };
  const sideNavigation = (
    <ClioNavigation
      activeSessionId={sessionId}
      activeWorkspaceId={workspaceId}
      actions={navigationActions}
      attentions={sessionAttentions}
      agents={installedAgents.data ?? []}
      endpoint={settings.endpoint}
      onOpenWorkspaceFiles={() => revealWorkbench({ kind: 'resources', section: 'files' })}
      sessions={navigationSessions}
      workspaces={workspaces.data ?? []}
      workspacesState={listState(workspaces)}
    />
  );
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
    // Mirror the hydrated tree's providers and shell key so finishing hydration
    // updates the shell in place instead of remounting the sidebar (which would
    // close any menu opened while the conversation was loading).
    return (
      <WorkspaceSessionProviders
        workspaceId={workspaceId}
        sessionId={sessionId}
        attention={attention.availability}
      >
        <QuestionAnswerContext.Provider value={questionAnswering.context}>
          <ClioCommandMenu onOpenResource={revealWorkbench} />
          <ClioAppShell
            key="shell"
            navigation={sideNavigation}
            contextBar={
              <div className="min-w-0 truncate text-sm font-medium">
                {rememberedSession?.title ?? 'Opening conversation'}
              </div>
            }
            statusStrip={<WorkspaceLiveStatusStrip work={work} sessionId={sessionId} />}
            workbench={
              <div aria-label="Workspace canvas loading" className="h-full bg-background" />
            }
          >
            <WorkspaceHydrating />
          </ClioAppShell>
        </QuestionAnswerContext.Provider>
      </WorkspaceSessionProviders>
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
    session.state === 'running' ? 'running' : mutations.send.isPending ? 'queued' : session.state;
  const renderComposer = (variant: 'docked' | 'welcome') => (
    <WorkspaceComposer
      variant={variant}
      session={session}
      sessionId={sessionId}
      workspaceId={workspaceId}
      state={state}
      data={data}
      mutations={mutations}
      commands={sessionCommands}
      draft={composerDraft}
      conversation={{
        welcome: showConversationWelcome,
        messageCount,
        setStarted: setConversationStarted,
      }}
      hold={hold}
      catalogPreparing={a2uiCatalog.isLoading}
      focusRequestKey={composerFocusKey}
      pendingInteractions={pendingInteractionsPanel}
      submit={questionAnswering.submit}
      onHeightChange={setDockedComposerHeight}
      onReturnToParent={() => workbench.openParentSession(session)}
      onOpenResource={workbench.openWorkspaceResource}
      onOpenReference={openReference}
    />
  );
  return (
    <WorkspaceSessionProviders
      workspaceId={workspaceId}
      sessionId={sessionId}
      attention={attention.availability}
    >
      <QuestionAnswerContext.Provider value={questionAnswering.context}>
        <ClioCommandMenu onOpenResource={revealWorkbench} />
        <ClioMoreDetails
          composerDraft={composerDraft}
          focusComposer={() => setComposerFocusKey((key) => key + 1)}
          model={data.activeModel}
          provider={data.activeProvider}
          sessionId={sessionId}
          workspaceId={workspaceId}
        />
        <ClioAppShell
          key="shell"
          toolbarActions={
            <WorkspaceObservabilityDock
              data={data}
              navigation={workbench}
              sessionId={sessionId}
              workspaceId={workspaceId}
              sessionState={state}
              surfaceRef={showcaseSurfaceRef}
              onOpenCanvas={openObservability}
              onOpenWork={openWork}
            />
          }
          navigation={sideNavigation}
          contextBar={
            <WorkspaceContextBar
              session={session}
              parentSession={data.parentSession}
              workspaceLabel={activeWorkspace ? workspaceName(activeWorkspace) : undefined}
              endpoint={settings.endpoint}
              history={sessionHistory}
              navigationActions={navigationActions}
              terminalActions={terminalActions}
              onOpenWorkspace={() => revealWorkbench({ kind: 'resources', section: 'files' })}
            />
          }
          workbench={
            <WorkspaceWorkbench
              data={data}
              navigation={workbench}
              sessionId={sessionId}
              workspaceId={workspaceId}
              endpoint={settings.endpoint}
              inStudy={inStudy}
              diffActions={diffActions}
              terminalActions={terminalActions}
              requestedView={requestedView}
              contextTargetId={contextTargetId}
              onContextTargetChange={setContextTargetId}
              onFilesViewActiveChange={setFilesViewActive}
              workspaceFolders={activeWorkspace?.source_folders}
            />
          }
          workbenchReveal={workbench.requests}
          statusStrip={
            <WorkspaceLiveStatusStrip
              work={work}
              onInspectTasks={() => openObservability()}
              onOpenWork={openWork}
              sessionId={sessionId}
              sessionState={session.state}
            />
          }
        >
          <WorkspaceTranscript
            surfaceRef={showcaseSurfaceRef}
            session={session}
            sessionId={sessionId}
            workspaceId={workspaceId}
            state={state}
            data={data}
            mutations={mutations}
            history={sessionHistory}
            navigation={workbench}
            attention={attention}
            resources={workspaceResourceEntities}
            repository={repository}
            messageCount={messageCount}
            damaged={transcriptDamaged}
            navigationActions={navigationActions}
            showWelcome={showConversationWelcome}
            dockedComposerHeight={dockedComposerHeight}
            composer={renderComposer}
            onOpenReference={openReference}
            onOpenTasks={openTasks}
            onInteractionResponse={handleInteractionResponse}
          />
        </ClioAppShell>
      </QuestionAnswerContext.Provider>
    </WorkspaceSessionProviders>
  );
}
