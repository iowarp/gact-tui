import type { AgentEntry, Session, Workspace } from '@clio/core/v3';
import { AddIcon } from '@/lib/icon-vocabulary';
import { useMemo, useState } from 'react';
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar';
import { sessionAgentLabel } from '@/lib/plugin-presentation';
import { useStableEvent } from '@/hooks/use-stable-event';
import { isPrimarySession, sessionInteractionAt } from '@/lib/recent-sessions';
import { VISIBLE_WORKSPACE_LIMIT } from '@/lib/runtime-limits';
import type { SessionAttention } from '@/lib/session-attention';
import { isSessionRunning } from '@/lib/session-state';
import { workspaceLabels } from '@/lib/workspace-labels';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { ListGroupLabel } from '@/components/clio/primitives/list-row';
import type { ListState } from '@/lib/list-state';
import type { ResourceActions, ResourceTarget } from './resource-dialogs';
import { DEFAULT_WORKSPACE_ID } from './workspace-actions-menu';
import type { ConversationFilter } from './conversation-list-groups';
import { SessionNavigationRow } from './workspace-navigation-session-row';
import { useHeldValue, useRailHeld } from './rail-menu-hold';
import { LooseConversations } from './workspace-navigation-loose-conversations';
import { RailIconFailure, RailState, ShowMoreRow } from './workspace-navigation-rail-rows';
import { WorkspaceTreeItem } from './workspace-navigation-tree-item';

interface WorkspaceNavigationProps {
  workspaces: readonly Workspace[];
  sessions: readonly Session[];
  /** Installed agents, to name the agent each conversation runs. */
  agents: readonly AgentEntry[];
  activeWorkspaceId: string;
  activeSessionId: string;
  actions: ResourceActions;
  onCreateSession: (workspaceId: string) => void;
  onImportSession?: (workspaceId: string) => void;
  onRename: (target: ResourceTarget) => void;
  onDelete: (target: ResourceTarget) => void;
  onEditWorkspace: (workspaceId: string) => void;
  onDownloadSession: (
    sessionId: string,
    title: string,
    mode: import('@clio/core/v3').SessionExportMode,
  ) => Promise<void>;
  onOpenWorkspaceFiles?: (workspaceId: string) => void;
  onNewWorkspace: () => void;
  onAction: (action: () => Promise<void>, success: string) => void;
  attentions: Readonly<Record<string, SessionAttention>>;
  /** The workspace whose unsent draft is open, shown as a selected row. */
  draftWorkspaceId?: string;
  /** The conversation that draft already became; the draft row stands for it. */
  draftSessionId?: string;
  /** Whether the workspace list is still loading or failed, while it lists none. */
  workspacesState?: ListState;
}

export function WorkspaceNavigation({
  workspaces: liveWorkspaces,
  sessions: liveSessions,
  agents,
  activeWorkspaceId,
  activeSessionId,
  actions,
  onCreateSession,
  onImportSession,
  onRename,
  onDelete,
  onEditWorkspace,
  onDownloadSession,
  onOpenWorkspaceFiles,
  onNewWorkspace,
  onAction,
  attentions,
  draftWorkspaceId,
  draftSessionId,
  workspacesState,
}: WorkspaceNavigationProps) {
  // An open row menu keeps the lists it opened over; the refresh lands on close.
  const railHeld = useRailHeld();
  const workspaces = useHeldValue(liveWorkspaces, railHeld);
  const sessions = useHeldValue(liveSessions, railHeld);
  const labels = useMemo(() => workspaceLabels(workspaces), [workspaces]);
  const [showAllWorkspaces, setShowAllWorkspaces] = useState(false);
  const [expandedSessionsFor, setExpandedSessionsFor] = useState<string>();
  const [workspaceExpansion, setWorkspaceExpansion] = useState<Record<string, boolean>>({});
  const [sessionObservationStartedAt] = useState(() => new Date().toISOString());
  const [seenSessionRevisions, setSeenSessionRevisions] = useState<Record<string, string>>({});
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const effectiveSeenSessionRevisions = useMemo(
    () =>
      Object.fromEntries(
        sessions.flatMap((session) => {
          const interactionAt = sessionInteractionAt(session);
          if (session.id === activeSessionId) return [[session.id, interactionAt]];
          const seenRevision = seenSessionRevisions[session.id];
          if (seenRevision !== undefined) return [[session.id, seenRevision]];
          return interactionAt <= sessionObservationStartedAt ? [[session.id, interactionAt]] : [];
        }),
      ),
    [activeSessionId, seenSessionRevisions, sessionObservationStartedAt, sessions],
  );
  const visibleWorkspaces = useMemo(() => {
    // Preserve the server/user-defined order. A workspace moves only after the
    // user explicitly changes its pinned state, never because they opened a
    // session or new activity arrived.
    const ordered = workspaces
      .filter((workspace) => workspace.id !== DEFAULT_WORKSPACE_ID)
      .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)));
    if (showAllWorkspaces) return ordered;
    const visible = ordered.slice(0, VISIBLE_WORKSPACE_LIMIT);
    const activeWorkspace = ordered.find((workspace) => workspace.id === activeWorkspaceId);
    if (!activeWorkspace || visible.some((workspace) => workspace.id === activeWorkspace.id)) {
      return visible;
    }
    return [...visible.slice(0, VISIBLE_WORKSPACE_LIMIT - 1), activeWorkspace];
  }, [activeWorkspaceId, showAllWorkspaces, workspaces]);

  // The same states each row marks: waiting on the user, working, or changed since last seen.
  const matchesFilter = (session: Session, filter: ConversationFilter) => {
    const needsYou = Boolean(attentions[session.id]?.total);
    const running = isSessionRunning(session.state);
    if (filter === 'attention') return needsYou;
    if (filter === 'running') return running;
    if (filter === 'unseen')
      return (
        !running &&
        !needsYou &&
        session.id !== activeSessionId &&
        effectiveSeenSessionRevisions[session.id] !== sessionInteractionAt(session)
      );
    return true;
  };

  const visitSession = useStableEvent((session: Session) => {
    setSeenSessionRevisions((current) => ({
      ...current,
      ...(activeSession ? { [activeSession.id]: sessionInteractionAt(activeSession) } : {}),
      [session.id]: sessionInteractionAt(session),
    }));
  });
  // Rows are memoized: hand them callbacks that keep one identity across renders.
  const rowAction = useStableEvent(onAction);
  const rowDelete = useStableEvent(onDelete);
  const rowRename = useStableEvent(onRename);
  const rowDownload = useStableEvent(onDownloadSession);
  const workspacePaths = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace.path])),
    [workspaces],
  );

  // Pinned conversations leave their workspace for the Pinned group.
  const pinnedSessions = useMemo(
    () =>
      sessions
        .filter((session) => session.pinned && !session.archived && isPrimarySession(session))
        .sort((left, right) =>
          sessionInteractionAt(right).localeCompare(sessionInteractionAt(left)),
        ),
    [sessions],
  );
  const pinnedSessionIds = useMemo(
    () => new Set(pinnedSessions.map((session) => session.id)),
    [pinnedSessions],
  );
  // Workspace lists leave out pinned rows and the conversation the open draft became.
  const unlistedSessionIds = useMemo(
    () => (draftSessionId ? new Set([...pinnedSessionIds, draftSessionId]) : pinnedSessionIds),
    [pinnedSessionIds, draftSessionId],
  );
  const workspaceSessionsFor = (workspaceId: string) =>
    sessions.filter(
      (session) =>
        session.workspace_id === workspaceId && !session.archived && isPrimarySession(session),
    );
  const renderSession = (session: Session, topLevel: boolean, depth = 0) => (
    <SessionNavigationRow
      actions={actions}
      activeSessionId={activeSessionId}
      attention={attentions[session.id]}
      agentLabel={sessionAgentLabel(session, agents)}
      key={session.id}
      nestedDepth={depth}
      onAction={rowAction}
      onDelete={rowDelete}
      onDownloadSession={rowDownload}
      onRename={rowRename}
      onVisit={visitSession}
      seenRevision={effectiveSeenSessionRevisions[session.id]}
      session={session}
      topLevel={topLevel}
      workspaceId={session.workspace_id}
      workspacePath={workspacePaths.get(session.workspace_id)}
    />
  );

  const renderWorkspace = (workspace: Workspace) => {
    const workspaceSessions = workspaceSessionsFor(workspace.id);
    const expanded =
      workspace.id === draftWorkspaceId ||
      (workspaceExpansion[workspace.id] ?? workspace.id === activeWorkspaceId);
    return (
      <WorkspaceTreeItem
        actions={actions}
        activeWorkspaceId={activeWorkspaceId}
        draft={workspace.id === draftWorkspaceId}
        expanded={expanded}
        key={workspace.id}
        label={labels.get(workspace.id) ?? { name: workspace.display_name, qualifiers: [] }}
        onAction={onAction}
        onCreateSession={onCreateSession}
        onImportSession={onImportSession}
        onDelete={onDelete}
        onEditWorkspace={onEditWorkspace}
        onExpandedChange={(open) =>
          setWorkspaceExpansion((current) => ({ ...current, [workspace.id]: open }))
        }
        onRename={onRename}
        onOpenWorkspaceFiles={onOpenWorkspaceFiles}
        excludedSessionIds={unlistedSessionIds}
        renderSession={renderSession}
        sessionLimitExpanded={expandedSessionsFor === workspace.id}
        sessions={workspaceSessions}
        setSessionLimitExpanded={(open) => setExpandedSessionsFor(open ? workspace.id : undefined)}
        workspace={workspace}
      />
    );
  };
  const pinnedWorkspaces = visibleWorkspaces.filter((workspace) => workspace.pinned);
  const otherWorkspaces = visibleWorkspaces.filter((workspace) => !workspace.pinned);
  const defaultWorkspace = workspaces.find((workspace) => workspace.id === DEFAULT_WORKSPACE_ID);
  const listedWorkspaceCount = workspaces.length - (defaultWorkspace ? 1 : 0);

  return (
    <>
      {pinnedWorkspaces.length || pinnedSessions.length ? (
        <SidebarGroup className="py-0">
          <ListGroupLabel className="mt-2.5 h-[26px] group-data-[collapsible=icon]:hidden">
            Pinned
          </ListGroupLabel>
          <SidebarGroupContent className="grid min-w-0 gap-px">
            {pinnedWorkspaces.map(renderWorkspace)}
            <div className="grid min-w-0 gap-px group-data-[collapsible=icon]:hidden">
              {pinnedSessions.map((session) => renderSession(session, true))}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}
      <SidebarGroup className="py-0">
        <ListGroupLabel
          action={
            <IconButton
              icon={<AddIcon />}
              label="New workspace"
              onClick={onNewWorkspace}
              size="sm"
            />
          }
          className="mt-2.5 h-[26px] items-center pb-0 pr-1 group-data-[collapsible=icon]:hidden"
        >
          Workspaces
        </ListGroupLabel>
        <SidebarGroupContent className="grid min-w-0 gap-px">
          {otherWorkspaces.map(renderWorkspace)}
          {workspacesState?.error ? (
            <>
              <RailState
                error={workspacesState.error}
                failed={{ what: 'workspaces', verb: 'listed' }}
                kind="error"
                onRetry={workspacesState.retry}
                title="Workspaces could not be listed"
              />
              {/* The icon rail hides the line above, so a failure keeps one named cue there. */}
              <RailIconFailure error={workspacesState.error} onRetry={workspacesState.retry} />
            </>
          ) : workspacesState?.loading ? (
            <RailState kind="loading" title="Loading workspaces…" />
          ) : listedWorkspaceCount === 0 ? (
            <RailState kind="empty" title="No workspaces yet" />
          ) : null}
          {listedWorkspaceCount > VISIBLE_WORKSPACE_LIMIT ? (
            <ShowMoreRow
              expanded={showAllWorkspaces}
              railKey="more:workspaces"
              label={
                showAllWorkspaces
                  ? 'Show recent workspaces'
                  : `Show all ${listedWorkspaceCount} workspaces`
              }
              onToggle={() => setShowAllWorkspaces((visible) => !visible)}
            />
          ) : null}
        </SidebarGroupContent>
      </SidebarGroup>
      {defaultWorkspace || workspacesState?.error || workspacesState?.loading ? (
        <LooseConversations
          actions={actions}
          draft={draftWorkspaceId === DEFAULT_WORKSPACE_ID}
          excludedSessionIds={unlistedSessionIds}
          expanded={expandedSessionsFor === DEFAULT_WORKSPACE_ID}
          label={
            labels.get(DEFAULT_WORKSPACE_ID) ?? {
              name: defaultWorkspace?.display_name ?? 'Conversations',
              qualifiers: [],
            }
          }
          matchesFilter={matchesFilter}
          onAction={onAction}
          onCreateSession={onCreateSession}
          onImportSession={onImportSession}
          onDelete={onDelete}
          onEditWorkspace={onEditWorkspace}
          onExpandedChange={(open) =>
            setExpandedSessionsFor(open ? DEFAULT_WORKSPACE_ID : undefined)
          }
          onOpenWorkspaceFiles={onOpenWorkspaceFiles}
          onRename={onRename}
          renderSession={renderSession}
          sessions={workspaceSessionsFor(DEFAULT_WORKSPACE_ID)}
          workspace={defaultWorkspace}
        />
      ) : null}
    </>
  );
}
