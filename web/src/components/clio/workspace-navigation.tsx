import type { AgentEntry, Session, Workspace } from '@clio/core/v3';
import {
  ChevronRightIcon,
  ClipboardIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  PinIcon,
  PinOffIcon,
} from 'lucide-react';
import {
  AddIcon,
  DeleteIcon,
  EditIcon,
  MoreIcon,
  NewConversationIcon,
} from '@/lib/icon-vocabulary';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMatch } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '@/components/ui/sidebar';
import { copyText } from '@/lib/clipboard';
import { sessionAgentLabel } from '@/lib/plugin-presentation';
import {
  isPrimarySession,
  sessionInteractionAt,
  visibleWorkspaceSessions,
} from '@/lib/recent-sessions';
import { VISIBLE_WORKSPACE_LIMIT } from '@/lib/runtime-limits';
import type { SessionAttention } from '@/lib/session-attention';
import {
  workspaceLabels,
  workspaceLabelText,
  type WorkspaceDisplayLabel,
} from '@/lib/workspace-labels';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { ListRow } from '@/components/clio/primitives/list-row';
import { cn } from '@/lib/utils';
import { WorkspaceMark } from './workspace-mark';
import type { ResourceActions, ResourceTarget } from './resource-dialogs';
import { nestAgentForks } from './conversation-fork-origin';
import { SessionNavigationRow } from './workspace-navigation-session-row';
import { useRailSessions } from '@/hooks/use-rail-sessions';

interface WorkspaceNavigationProps {
  workspaces: readonly Workspace[];
  sessions: readonly Session[];
  /** Installed agents, to name the agent each conversation runs. */
  agents: readonly AgentEntry[];
  activeWorkspaceId: string;
  activeSessionId: string;
  actions: ResourceActions;
  onCreateSession: (workspaceId: string) => void;
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
      <span className="truncate font-medium">{label.name}</span>
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
  onRename,
  onDelete,
  onEditWorkspace,
  onDownloadSession,
  onOpenWorkspaceFiles,
  onNewWorkspace,
  onAction,
  attentions,
}: WorkspaceNavigationProps) {
  const labels = useMemo(() => workspaceLabels(workspaces), [workspaces]);
  const [showAllWorkspaces, setShowAllWorkspaces] = useState(false);
  const [expandedSessionsFor, setExpandedSessionsFor] = useState<string>();
  const [workspaceExpansion, setWorkspaceExpansion] = useState<Record<string, boolean>>({});
  const draftWorkspaceId = useMatch('/workspaces/:workspaceId/new')?.params.workspaceId;
  // Opening a draft shows it inside its workspace, even one the person had folded.
  const [unfoldedDraft, setUnfoldedDraft] = useState<string>();
  if (draftWorkspaceId !== unfoldedDraft) {
    setUnfoldedDraft(draftWorkspaceId);
    if (draftWorkspaceId && workspaceExpansion[draftWorkspaceId] === false) {
      setWorkspaceExpansion({ ...workspaceExpansion, [draftWorkspaceId]: true });
    }
  }
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
    const ordered = [...workspaces].sort(
      (left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)),
    );
    if (showAllWorkspaces) return ordered;
    const visible = ordered.slice(0, VISIBLE_WORKSPACE_LIMIT);
    const activeWorkspace = ordered.find((workspace) => workspace.id === activeWorkspaceId);
    if (!activeWorkspace || visible.some((workspace) => workspace.id === activeWorkspace.id)) {
      return visible;
    }
    return [...visible.slice(0, VISIBLE_WORKSPACE_LIMIT - 1), activeWorkspace];
  }, [activeWorkspaceId, showAllWorkspaces, workspaces]);

  const visitSession = (session: Session) => {
    setSeenSessionRevisions((current) => ({
      ...current,
      ...(activeSession ? { [activeSession.id]: sessionInteractionAt(activeSession) } : {}),
      [session.id]: sessionInteractionAt(session),
    }));
  };

  const renderWorkspace = (workspace: Workspace) => {
    const workspaceSessions = sessions.filter(
      (session) =>
        session.workspace_id === workspace.id && !session.archived && isPrimarySession(session),
    );
    const expanded = workspaceExpansion[workspace.id] ?? workspace.id === activeWorkspaceId;
    return (
      <WorkspaceTreeItem
        actions={actions}
        attentions={attentions}
        activeSessionId={activeSessionId}
        activeWorkspaceId={activeWorkspaceId}
        agents={agents}
        draftOpen={workspace.id === draftWorkspaceId}
        expanded={expanded}
        key={workspace.id}
        label={labels.get(workspace.id) ?? { name: workspace.display_name, qualifiers: [] }}
        onAction={onAction}
        onCreateSession={onCreateSession}
        onDelete={onDelete}
        onDownloadSession={onDownloadSession}
        onEditWorkspace={onEditWorkspace}
        onExpandedChange={(open) =>
          setWorkspaceExpansion((current) => ({ ...current, [workspace.id]: open }))
        }
        onRename={onRename}
        onOpenWorkspaceFiles={onOpenWorkspaceFiles}
        onVisitSession={visitSession}
        seenSessionRevisions={effectiveSeenSessionRevisions}
        sessionLimitExpanded={expandedSessionsFor === workspace.id}
        sessions={workspaceSessions}
        setSessionLimitExpanded={(open) => setExpandedSessionsFor(open ? workspace.id : undefined)}
        workspace={workspace}
      />
    );
  };
  const pinnedWorkspaces = visibleWorkspaces.filter((workspace) => workspace.pinned);
  const otherWorkspaces = visibleWorkspaces.filter((workspace) => !workspace.pinned);

  return (
    <>
      {pinnedWorkspaces.length ? (
        <SidebarGroup className="py-1">
          <SidebarGroupLabel className="gap-1.5">
            <PinIcon aria-hidden="true" className="size-3" />
            Pinned
          </SidebarGroupLabel>
          <SidebarGroupContent className="grid min-w-0 gap-px">
            {pinnedWorkspaces.map(renderWorkspace)}
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}
      <SidebarGroup className="py-1">
        <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
        <IconButton
          className="absolute right-2 top-1.5 group-data-[collapsible=icon]:hidden"
          icon={<AddIcon />}
          label="New workspace"
          onClick={onNewWorkspace}
          size="sm"
        />
        <SidebarGroupContent className="grid min-w-0 gap-px">
          {otherWorkspaces.map(renderWorkspace)}
          {workspaces.length > VISIBLE_WORKSPACE_LIMIT ? (
            <ListRow
              className="cursor-pointer pl-[30px] text-muted-foreground group-data-[collapsible=icon]:hidden"
              title={
                <button
                  aria-expanded={showAllWorkspaces}
                  className="outline-none after:absolute after:inset-0 after:rounded-[6px] focus-visible:after:ring-1 focus-visible:after:ring-ring"
                  onClick={() => setShowAllWorkspaces((visible) => !visible)}
                  type="button"
                >
                  {showAllWorkspaces
                    ? 'Show recent workspaces'
                    : `Show all ${workspaces.length} workspaces`}
                </button>
              }
            />
          ) : null}
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}

interface WorkspaceTreeItemProps {
  workspace: Workspace;
  sessions: readonly Session[];
  /** Installed agents, to name the agent each conversation runs. */
  agents: readonly AgentEntry[];
  label: WorkspaceDisplayLabel;
  /** A new conversation draft is open in this workspace. */
  draftOpen: boolean;
  expanded: boolean;
  sessionLimitExpanded: boolean;
  activeWorkspaceId: string;
  activeSessionId: string;
  seenSessionRevisions: Readonly<Record<string, string>>;
  actions: ResourceActions;
  onExpandedChange: (open: boolean) => void;
  setSessionLimitExpanded: (open: boolean) => void;
  onCreateSession: (workspaceId: string) => void;
  onRename: (target: ResourceTarget) => void;
  onDelete: (target: ResourceTarget) => void;
  onEditWorkspace: (workspaceId: string) => void;
  onDownloadSession: (
    sessionId: string,
    title: string,
    mode: import('@clio/core/v3').SessionExportMode,
  ) => Promise<void>;
  onOpenWorkspaceFiles?: () => void;
  onAction: (action: () => Promise<void>, success: string) => void;
  onVisitSession: (session: Session) => void;
  attentions: Readonly<Record<string, SessionAttention>>;
}

function WorkspaceTreeItem({
  workspace,
  sessions,
  agents,
  label,
  draftOpen,
  expanded,
  sessionLimitExpanded,
  activeWorkspaceId,
  activeSessionId,
  seenSessionRevisions,
  actions,
  onExpandedChange,
  setSessionLimitExpanded,
  onCreateSession,
  onRename,
  onDelete,
  onEditWorkspace,
  onDownloadSession,
  onOpenWorkspaceFiles,
  onAction,
  onVisitSession,
  attentions,
}: WorkspaceTreeItemProps) {
  // The rail reads its conversations a page at a time; live rows win over a page's copy.
  const rail = useRailSessions(workspace.id, sessions, expanded);
  const railSessions = rail.sessions.filter(
    (session) => !session.archived && isPrimarySession(session),
  );
  const sessionTotal = Math.max(rail.total ?? 0, railSessions.length);
  const visibleSessions = visibleWorkspaceSessions(
    railSessions,
    workspace.id,
    '',
    sessionLimitExpanded ? railSessions.length : undefined,
  ).sort((left, right) => Number(right.pinned) - Number(left.pinned));

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
          'select-none font-medium group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0',
          'group-data-[collapsible=icon]:[&>:not([data-slot=list-row-text])]:hidden group-data-[collapsible=icon]:[&>[data-slot=list-row-text]]:flex-none',
        )}
        data-current-workspace={workspace.id === activeWorkspaceId ? 'true' : undefined}
        meta={
          sessionTotal > 0 ? (
            <span className="font-mono text-[11px] font-normal tabular-nums text-muted-foreground">
              {sessionTotal}
            </span>
          ) : null
        }
        status={
          <ChevronRightIcon
            aria-hidden="true"
            className={cn(
              'size-3.5 text-muted-foreground transition-transform motion-reduce:transition-none',
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
          {draftOpen ? <DraftConversationRow /> : null}
          {nestAgentForks(visibleSessions).map(({ session, depth }) => (
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
              onVisit={onVisitSession}
              seenRevision={seenSessionRevisions[session.id]}
              session={session}
              workspaceId={workspace.id}
            />
          ))}
          {visibleSessions.length === 0 ? (
            <p className="h-7 truncate pl-[30px] text-[12px] leading-7 text-muted-foreground">
              No conversations yet
            </p>
          ) : null}
          {sessionLimitExpanded && (rail.hasMore || rail.loadingMore) ? (
            <RailLoadMore loading={rail.loadingMore} onLoadMore={rail.loadMore} />
          ) : null}
          {sessionTotal > 8 ? (
            <ListRow
              className="cursor-pointer pl-[30px] text-[12px] text-muted-foreground"
              title={
                <button
                  aria-expanded={sessionLimitExpanded}
                  className="outline-none after:absolute after:inset-0 after:rounded-[6px] focus-visible:after:ring-1 focus-visible:after:ring-ring"
                  onClick={() => setSessionLimitExpanded(!sessionLimitExpanded)}
                  type="button"
                >
                  {sessionLimitExpanded
                    ? 'Show recent sessions'
                    : `Show ${sessionTotal - visibleSessions.length > 0 ? `${sessionTotal - visibleSessions.length} more` : `all ${sessionTotal}`}`}
                </button>
              }
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
      className="h-7 w-full justify-start gap-1.5 pl-[30px] text-[12px] text-muted-foreground"
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

/** The open, unsent draft: selected, first in its workspace, until its first message. */
function DraftConversationRow() {
  return (
    <ListRow
      aria-current="page"
      className="pl-[30px]"
      data-draft-row=""
      meta={<span className="text-[11px] italic text-primary">now</span>}
      selected
      title={<span className="italic text-foreground">New conversation</span>}
    />
  );
}

interface WorkspaceActionsMenuProps {
  workspace: Workspace;
  label: WorkspaceDisplayLabel;
  activeWorkspaceId: string;
  actions: ResourceActions;
  onRename: (target: ResourceTarget) => void;
  onDelete: (target: ResourceTarget) => void;
  onEditWorkspace: (workspaceId: string) => void;
  onOpenWorkspaceFiles?: () => void;
  onAction: (action: () => Promise<void>, success: string) => void;
}

function WorkspaceActionsMenu({
  workspace,
  label,
  activeWorkspaceId,
  actions,
  onRename,
  onDelete,
  onEditWorkspace,
  onOpenWorkspaceFiles,
  onAction,
}: WorkspaceActionsMenuProps) {
  const labelText = workspaceLabelText(label);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton icon={<MoreIcon />} label={`Workspace actions for ${labelText}`} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="min-w-0">
          <WorkspaceLabelFields label={label} />
          <span
            className="mt-0.5 block truncate font-mono text-[0.625rem] font-normal text-muted-foreground"
            title={workspace.path}
          >
            {workspace.path}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="whitespace-nowrap"
          disabled={!onOpenWorkspaceFiles || workspace.id !== activeWorkspaceId}
          onSelect={() => onOpenWorkspaceFiles?.()}
        >
          <FolderOpenIcon aria-hidden="true" /> Browse files
        </DropdownMenuItem>
        <DropdownMenuItem
          className="whitespace-nowrap"
          onSelect={() =>
            onAction(
              () => actions.setWorkspacePinned(workspace.id, !workspace.pinned),
              workspace.pinned ? 'Workspace unpinned' : 'Workspace pinned',
            )
          }
        >
          {workspace.pinned ? <PinOffIcon aria-hidden="true" /> : <PinIcon aria-hidden="true" />}
          {workspace.pinned ? 'Unpin workspace' : 'Pin workspace'}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="whitespace-nowrap"
          onSelect={() => onRename({ kind: 'workspace', id: workspace.id, label: labelText })}
        >
          <EditIcon aria-hidden="true" /> Rename workspace
        </DropdownMenuItem>
        <DropdownMenuItem
          className="whitespace-nowrap"
          onSelect={() => void copyText(workspace.path)}
        >
          <ClipboardIcon aria-hidden="true" /> Copy folder path
        </DropdownMenuItem>
        <DropdownMenuItem
          className="whitespace-nowrap"
          onSelect={() => onEditWorkspace(workspace.id)}
        >
          <EditIcon aria-hidden="true" /> Edit workspace
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="whitespace-nowrap"
          disabled={workspace.id === 'ws_default'}
          onSelect={() => onDelete({ kind: 'workspace', id: workspace.id, label: labelText })}
          variant="destructive"
        >
          <DeleteIcon aria-hidden="true" /> Remove workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
