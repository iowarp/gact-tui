import type { AgentEntry, Session, Workspace } from '@clio/core/v3';
import { ChevronRightIcon, LoaderCircleIcon } from 'lucide-react';
import { AddIcon, NewConversationIcon, SettingsIcon } from '@/lib/icon-vocabulary';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar';
import { sessionAgentLabel } from '@/lib/plugin-presentation';
import {
  isPrimarySession,
  sessionInteractionAt,
  visibleWorkspaceSessions,
} from '@/lib/recent-sessions';
import { VISIBLE_WORKSPACE_LIMIT } from '@/lib/runtime-limits';
import type { SessionAttention } from '@/lib/session-attention';
import { isSessionRunning } from '@/lib/session-state';
import {
  workspaceLabels,
  workspaceLabelText,
  type WorkspaceDisplayLabel,
} from '@/lib/workspace-labels';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { ListGroupLabel, ListRow } from '@/components/clio/primitives/list-row';
import { cn } from '@/lib/utils';
import { WorkspaceMark } from './workspace-mark';
import type { ResourceActions, ResourceTarget } from './resource-dialogs';
import { DEFAULT_WORKSPACE_ID, WorkspaceActionsMenu } from './workspace-actions-menu';
import {
  ConversationDayLabel,
  ConversationFilterMenu,
  NoMatchingConversations,
  type ConversationFilter,
} from './conversation-list-groups';
import { groupConversationsByDay } from './conversation-day-groups';
import { nestAgentForks } from './conversation-fork-origin';
import { SessionNavigationRow } from './workspace-navigation-session-row';
import { useRailSessionCount, useRailSessions } from '@/hooks/use-rail-sessions';

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
  onOpenWorkspaceFiles?: () => void;
  onNewWorkspace: () => void;
  onAction: (action: () => Promise<void>, success: string) => void;
  attentions: Readonly<Record<string, SessionAttention>>;
  /** The workspace whose unsent draft is open, shown as a selected row. */
  draftWorkspaceId?: string;
}

/** The unsent draft at /workspaces/<id>/new, selected, until its first message. */
function DraftConversationRow({ topLevel }: { topLevel: boolean }) {
  return (
    <ListRow
      aria-current="page"
      className={cn(
        'data-selected:bg-accent data-selected:text-accent-foreground',
        topLevel ? 'pl-2.5' : 'pl-[34px]',
      )}
      data-draft-row=""
      meta={<span className="text-[11px] italic text-accent-foreground/80">now</span>}
      selected
      title={<span className="truncate italic">New conversation</span>}
    />
  );
}

function WorkspaceLabelFields({
  className = '',
  label,
}: {
  className?: string;
  label: WorkspaceDisplayLabel;
}) {
  return (
    <span className={`flex min-w-0 items-baseline gap-1.5 ${className}`}>
      <span className="truncate">{label.name}</span>
      {label.qualifiers.map((qualifier) => (
        <span className="shrink-0 text-xs font-normal text-muted-foreground" key={qualifier}>
          {qualifier}
        </span>
      ))}
    </span>
  );
}

export function WorkspaceNavigation({
  workspaces,
  sessions,
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
}: WorkspaceNavigationProps) {
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

  const visitSession = (session: Session) => {
    setSeenSessionRevisions((current) => ({
      ...current,
      ...(activeSession ? { [activeSession.id]: sessionInteractionAt(activeSession) } : {}),
      [session.id]: sessionInteractionAt(session),
    }));
  };

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
      onAction={onAction}
      onDelete={onDelete}
      onDownloadSession={onDownloadSession}
      onRename={onRename}
      onVisit={visitSession}
      seenRevision={effectiveSeenSessionRevisions[session.id]}
      session={session}
      topLevel={topLevel}
      workspaceId={session.workspace_id}
      workspacePath={workspaces.find((workspace) => workspace.id === session.workspace_id)?.path}
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
        excludedSessionIds={pinnedSessionIds}
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
          {listedWorkspaceCount > VISIBLE_WORKSPACE_LIMIT ? (
            <ShowMoreRow
              expanded={showAllWorkspaces}
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
      {defaultWorkspace ? (
        <LooseConversations
          actions={actions}
          activeWorkspaceId={activeWorkspaceId}
          draft={draftWorkspaceId === DEFAULT_WORKSPACE_ID}
          excludedSessionIds={pinnedSessionIds}
          expanded={expandedSessionsFor === DEFAULT_WORKSPACE_ID}
          label={
            labels.get(defaultWorkspace.id) ?? {
              name: defaultWorkspace.display_name,
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
          sessions={workspaceSessionsFor(defaultWorkspace.id)}
          workspace={defaultWorkspace}
        />
      ) : null}
    </>
  );
}

/** The fold row under a list: "Show 12 more", quiet and aligned with the titles. */
function ShowMoreRow({
  expanded,
  label,
  onToggle,
  indent = false,
}: {
  expanded: boolean;
  label: string;
  onToggle: () => void;
  indent?: boolean;
}) {
  return (
    <ListRow
      className={cn(
        'h-[26px] cursor-pointer text-[11.5px] text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:hidden',
        indent ? 'pl-[34px]' : 'pl-2.5',
      )}
      title={
        <button
          aria-expanded={expanded}
          className="outline-none after:absolute after:inset-0 after:rounded-[6px] focus-visible:after:ring-1 focus-visible:after:ring-ring"
          onClick={onToggle}
          type="button"
        >
          {label}
        </button>
      }
    />
  );
}

/** Which rows a conversation list shows, given its rail page and fold state. */
function useConversationList(
  workspaceId: string,
  sessions: readonly Session[],
  open: boolean,
  expanded: boolean,
  excludedSessionIds: ReadonlySet<string>,
) {
  // The rail reads its conversations a page at a time; live rows win over a page's copy.
  const rail = useRailSessions(workspaceId, sessions, open);
  // A folded workspace never loaded its pages, so it asks only for the count.
  const foldedCount = useRailSessionCount(workspaceId, !open && rail.total === undefined);
  const railSessions = rail.sessions.filter(
    (session) => !session.archived && isPrimarySession(session),
  );
  const listed = railSessions.filter((session) => !excludedSessionIds.has(session.id));
  const pinnedHere =
    rail.total === undefined && foldedCount !== undefined
      ? sessions.filter(
          (session) =>
            session.workspace_id === workspaceId &&
            excludedSessionIds.has(session.id) &&
            !session.archived &&
            isPrimarySession(session),
        ).length
      : railSessions.length - listed.length;
  const total = Math.max((rail.total ?? foldedCount ?? 0) - pinnedHere, listed.length);
  const visible = visibleWorkspaceSessions(
    listed,
    workspaceId,
    '',
    expanded ? listed.length : undefined,
  ).sort((left, right) => Number(right.pinned) - Number(left.pinned));
  return { rail, total, visible };
}

interface LooseConversationsProps {
  workspace: Workspace;
  label: WorkspaceDisplayLabel;
  sessions: readonly Session[];
  excludedSessionIds: ReadonlySet<string>;
  expanded: boolean;
  activeWorkspaceId: string;
  actions: ResourceActions;
  onExpandedChange: (open: boolean) => void;
  onCreateSession: (workspaceId: string) => void;
  onImportSession?: (workspaceId: string) => void;
  onRename: (target: ResourceTarget) => void;
  onDelete: (target: ResourceTarget) => void;
  onEditWorkspace: (workspaceId: string) => void;
  onOpenWorkspaceFiles?: () => void;
  onAction: (action: () => Promise<void>, success: string) => void;
  renderSession: (session: Session, topLevel: boolean, depth?: number) => ReactNode;
  matchesFilter: (session: Session, filter: ConversationFilter) => boolean;
  draft: boolean;
}

/** The flat "Conversations" list: conversations that belong to no project workspace. */
function LooseConversations({
  workspace,
  label,
  sessions,
  excludedSessionIds,
  expanded,
  activeWorkspaceId,
  actions,
  onExpandedChange,
  onCreateSession,
  onImportSession,
  onRename,
  onDelete,
  onEditWorkspace,
  onOpenWorkspaceFiles,
  onAction,
  renderSession,
  matchesFilter,
  draft,
}: LooseConversationsProps) {
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const filtering = filter !== 'all';
  // A filter looks through every loaded row, not only the first eight.
  const { rail, total, visible } = useConversationList(
    workspace.id,
    sessions,
    true,
    expanded || filtering,
    excludedSessionIds,
  );
  if (total === 0 && !draft) return null;
  const shown = filtering ? visible.filter((session) => matchesFilter(session, filter)) : visible;
  const groups = groupConversationsByDay(nestAgentForks(shown));
  // The unsent draft is always new, so it opens the Today group.
  const draftOpensToday = draft && groups[0]?.label === 'Today';
  return (
    <SidebarGroup className="py-0 group-data-[collapsible=icon]:hidden">
      <ListGroupLabel
        action={
          <>
            <ConversationFilterMenu onChange={setFilter} value={filter} />
            <WorkspaceActionsMenu
              activeWorkspaceId={activeWorkspaceId}
              actions={actions}
              label={label}
              onAction={onAction}
              onCreateSession={onCreateSession}
              onImportSession={onImportSession}
              onDelete={onDelete}
              onEditWorkspace={onEditWorkspace}
              onOpenWorkspaceFiles={onOpenWorkspaceFiles}
              onRename={onRename}
              triggerIcon={<SettingsIcon />}
              triggerLabel="Conversation settings"
              workspace={workspace}
            />
          </>
        }
        className="mt-2.5 h-[26px] items-center pb-0 pr-1"
      >
        Conversations
      </ListGroupLabel>
      <SidebarGroupContent className="grid min-w-0 gap-px">
        {draft && !draftOpensToday ? (
          <>
            <ConversationDayLabel>Today</ConversationDayLabel>
            <DraftConversationRow topLevel />
          </>
        ) : null}
        {groups.map((group, index) => (
          <Fragment key={group.label}>
            <ConversationDayLabel>{group.label}</ConversationDayLabel>
            {index === 0 && draftOpensToday ? <DraftConversationRow topLevel /> : null}
            {group.rows.map(({ session, depth }) => renderSession(session, true, depth))}
          </Fragment>
        ))}
        {filtering && shown.length === 0 ? (
          <NoMatchingConversations onShowAll={() => setFilter('all')} />
        ) : null}
        {expanded && !filtering && (rail.hasMore || rail.loadingMore) ? (
          <RailLoadMore loading={rail.loadingMore} onLoadMore={rail.loadMore} />
        ) : null}
        {total > 8 && !filtering ? (
          <ShowMoreRow
            expanded={expanded}
            label={
              expanded
                ? 'Show recent conversations'
                : `Show ${total - visible.length > 0 ? `${total - visible.length} more` : `all ${total}`}`
            }
            onToggle={() => onExpandedChange(!expanded)}
          />
        ) : null}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

interface WorkspaceTreeItemProps {
  workspace: Workspace;
  sessions: readonly Session[];
  excludedSessionIds: ReadonlySet<string>;
  label: WorkspaceDisplayLabel;
  expanded: boolean;
  sessionLimitExpanded: boolean;
  activeWorkspaceId: string;
  actions: ResourceActions;
  onExpandedChange: (open: boolean) => void;
  setSessionLimitExpanded: (open: boolean) => void;
  onCreateSession: (workspaceId: string) => void;
  onImportSession?: (workspaceId: string) => void;
  onRename: (target: ResourceTarget) => void;
  onDelete: (target: ResourceTarget) => void;
  onEditWorkspace: (workspaceId: string) => void;
  onOpenWorkspaceFiles?: () => void;
  onAction: (action: () => Promise<void>, success: string) => void;
  renderSession: (session: Session, topLevel: boolean, depth?: number) => ReactNode;
  draft: boolean;
}

function WorkspaceTreeItem({
  workspace,
  sessions,
  excludedSessionIds,
  label,
  expanded,
  sessionLimitExpanded,
  activeWorkspaceId,
  actions,
  onExpandedChange,
  setSessionLimitExpanded,
  onCreateSession,
  onImportSession,
  onRename,
  onDelete,
  onEditWorkspace,
  onOpenWorkspaceFiles,
  onAction,
  renderSession,
  draft,
}: WorkspaceTreeItemProps) {
  const {
    rail,
    total: sessionTotal,
    visible: visibleSessions,
  } = useConversationList(
    workspace.id,
    sessions,
    expanded,
    sessionLimitExpanded,
    excludedSessionIds,
  );

  return (
    <Collapsible className="min-w-0" onOpenChange={onExpandedChange} open={expanded}>
      <ListRow
        actions={
          <>
            <WorkspaceActionsMenu
              activeWorkspaceId={activeWorkspaceId}
              actions={actions}
              label={label}
              onAction={onAction}
              onCreateSession={onCreateSession}
              onImportSession={onImportSession}
              onDelete={onDelete}
              onEditWorkspace={onEditWorkspace}
              onOpenWorkspaceFiles={onOpenWorkspaceFiles}
              onRename={onRename}
              workspace={workspace}
            />
            <IconButton
              icon={<NewConversationIcon />}
              label={`New conversation in ${workspaceLabelText(label)}`}
              onClick={() => onCreateSession(workspace.id)}
              size="sm"
            />
          </>
        }
        actionsOverlay
        actionsWidth={48}
        className={cn(
          'select-none font-semibold group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0',
          'group-data-[collapsible=icon]:[&>:not([data-slot=list-row-text])]:hidden group-data-[collapsible=icon]:[&>[data-slot=list-row-text]]:flex-none',
        )}
        data-current-workspace={workspace.id === activeWorkspaceId ? 'true' : undefined}
        meta={
          // An open workspace shows its conversations; only a folded one counts them.
          sessionTotal > 0 && !expanded ? (
            <span className="text-[11px] font-normal tabular-nums text-faint">{sessionTotal}</span>
          ) : null
        }
        status={
          <ChevronRightIcon
            aria-hidden="true"
            className={cn(
              'size-3.5 text-faint transition-transform motion-reduce:transition-none',
              expanded && 'rotate-90',
            )}
          />
        }
        title={
          <WorkspaceDisclosureButton
            label={label}
            onExpandedChange={onExpandedChange}
            workspaceExpanded={expanded}
            workspaceId={workspace.id}
          />
        }
      />
      <CollapsibleContent>
        <div className="grid min-w-0 gap-px group-data-[collapsible=icon]:hidden">
          {draft ? <DraftConversationRow topLevel={false} /> : null}
          {nestAgentForks(visibleSessions).map(({ session, depth }) =>
            renderSession(session, false, depth),
          )}
          {visibleSessions.length === 0 && !draft ? (
            <p className="h-7 truncate pl-[34px] text-[12px] leading-7 text-muted-foreground">
              No conversations yet
            </p>
          ) : null}
          {sessionLimitExpanded && (rail.hasMore || rail.loadingMore) ? (
            <RailLoadMore loading={rail.loadingMore} onLoadMore={rail.loadMore} />
          ) : null}
          {sessionTotal > 8 ? (
            <ShowMoreRow
              expanded={sessionLimitExpanded}
              indent
              label={
                sessionLimitExpanded
                  ? 'Show recent conversations'
                  : `Show ${sessionTotal - visibleSessions.length > 0 ? `${sessionTotal - visibleSessions.length} more` : `all ${sessionTotal}`}`
              }
              onToggle={() => setSessionLimitExpanded(!sessionLimitExpanded)}
            />
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Loads the next rail page when it scrolls into view, or on click. */
function RailLoadMore({ loading, onLoadMore }: { loading: boolean; onLoadMore: () => void }) {
  const sentinel = useRef<HTMLButtonElement>(null);
  const load = useRef(onLoadMore);
  useEffect(() => {
    load.current = onLoadMore;
  });
  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) load.current();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <Button
      aria-busy={loading || undefined}
      className="h-7 w-full justify-start gap-1.5 pl-[34px] text-[11.5px] text-muted-foreground"
      disabled={loading}
      onClick={onLoadMore}
      ref={sentinel}
      size="sm"
      type="button"
      variant="ghost"
    >
      {loading ? <LoaderCircleIcon aria-hidden="true" className="size-3 animate-spin" /> : null}
      {loading ? 'Loading more sessions…' : 'Load more sessions'}
    </Button>
  );
}

interface WorkspaceDisclosureButtonProps {
  label: WorkspaceDisplayLabel;
  workspaceId: string;
  workspaceExpanded: boolean;
  onExpandedChange: (open: boolean) => void;
}

function WorkspaceDisclosureButton({
  label,
  workspaceId,
  workspaceExpanded,
  onExpandedChange,
}: WorkspaceDisclosureButtonProps) {
  const labelText = workspaceLabelText(label);
  return (
    <button
      aria-expanded={workspaceExpanded}
      aria-label={`${workspaceExpanded ? 'Collapse' : 'Expand'} workspace ${labelText}`}
      className="flex w-full min-w-0 cursor-pointer items-center gap-2 text-left outline-none after:absolute after:inset-0 after:rounded-[6px] focus-visible:after:ring-1 focus-visible:after:ring-ring"
      onClick={() => onExpandedChange(!workspaceExpanded)}
      title={labelText}
      type="button"
    >
      <WorkspaceMark id={workspaceId} />
      <WorkspaceLabelFields className="group-data-[collapsible=icon]:hidden" label={label} />
    </button>
  );
}
