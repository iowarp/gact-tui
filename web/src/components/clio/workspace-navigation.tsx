import type { AgentBlueprint, Session, Workspace } from '@clio/core/v3';
import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardIcon,
  DownloadIcon,
  FolderGit2Icon,
  FolderOpenIcon,
  LoaderCircleIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  Settings2Icon,
  Trash2Icon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { visibleWorkspaceSessions } from '@/lib/recent-sessions';
import { workspaceLabels } from '@/lib/workspace-labels';
import { ClioInteractiveRow } from './interactive-row';
import type { ResourceActions, ResourceTarget } from './resource-dialogs';

interface WorkspaceNavigationProps {
  workspaces: readonly Workspace[];
  sessions: readonly Session[];
  blueprints: readonly AgentBlueprint[];
  activeWorkspaceId: string;
  activeSessionId: string;
  actions: ResourceActions;
  onCreateSession: (workspaceId: string) => void;
  onRename: (target: ResourceTarget) => void;
  onDelete: (target: ResourceTarget) => void;
  onEditWorkspace: (workspaceId: string) => void;
  onDownloadSession: (sessionId: string, title: string) => Promise<void>;
  onOpenWorkspaceFiles?: () => void;
  onAction: (action: () => Promise<void>, success: string) => void;
}

export function WorkspaceNavigation({
  workspaces,
  sessions,
  blueprints,
  activeWorkspaceId,
  activeSessionId,
  actions,
  onCreateSession,
  onRename,
  onDelete,
  onEditWorkspace,
  onDownloadSession,
  onOpenWorkspaceFiles,
  onAction,
}: WorkspaceNavigationProps) {
  const labels = useMemo(() => workspaceLabels(workspaces), [workspaces]);
  const [showAllWorkspaces, setShowAllWorkspaces] = useState(false);
  const [expandedSessionsFor, setExpandedSessionsFor] = useState<string>();
  const [workspaceExpansion, setWorkspaceExpansion] = useState<Record<string, boolean>>({});
  const [seenSessionRevisions, setSeenSessionRevisions] = useState<Record<string, string>>(() =>
    Object.fromEntries(sessions.map((session) => [session.id, session.updated_at])),
  );
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const visibleWorkspaces = useMemo(() => {
    const latestSessionByWorkspace = new Map<string, string>();
    for (const session of sessions) {
      const current = latestSessionByWorkspace.get(session.workspace_id);
      if (!current || session.updated_at > current) {
        latestSessionByWorkspace.set(session.workspace_id, session.updated_at);
      }
    }
    const ordered = [...workspaces].sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      if (left.id === activeWorkspaceId) return -1;
      if (right.id === activeWorkspaceId) return 1;
      return (latestSessionByWorkspace.get(right.id) ?? '').localeCompare(
        latestSessionByWorkspace.get(left.id) ?? '',
      );
    });
    return showAllWorkspaces ? ordered : ordered.slice(0, 7);
  }, [activeWorkspaceId, sessions, showAllWorkspaces, workspaces]);

  const visitSession = (session: Session) => {
    setSeenSessionRevisions((current) => ({
      ...current,
      ...(activeSession ? { [activeSession.id]: activeSession.updated_at } : {}),
      [session.id]: session.updated_at,
    }));
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
      <SidebarGroupContent className="grid min-w-0 gap-1">
        {visibleWorkspaces.map((workspace) => {
          const workspaceSessions = sessions.filter(
            (session) => session.workspace_id === workspace.id && !session.archived,
          );
          const expanded = workspaceExpansion[workspace.id] ?? workspace.id === activeWorkspaceId;
          return (
            <WorkspaceTreeItem
              actions={actions}
              activeSessionId={activeSessionId}
              activeWorkspaceId={activeWorkspaceId}
              blueprints={blueprints}
              expanded={expanded}
              key={workspace.id}
              label={labels.get(workspace.id) ?? workspace.display_name}
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
              seenSessionRevisions={seenSessionRevisions}
              sessionLimitExpanded={expandedSessionsFor === workspace.id}
              sessions={workspaceSessions}
              setSessionLimitExpanded={(open) =>
                setExpandedSessionsFor(open ? workspace.id : undefined)
              }
              workspace={workspace}
            />
          );
        })}
        {workspaces.length > 7 ? (
          <Button
            className="mt-1 w-full justify-between group-data-[collapsible=icon]:hidden"
            onClick={() => setShowAllWorkspaces((visible) => !visible)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <span>
              {showAllWorkspaces
                ? 'Show recent workspaces'
                : `Show all ${workspaces.length} workspaces`}
            </span>
            {showAllWorkspaces ? (
              <ChevronUpIcon aria-hidden="true" />
            ) : (
              <ChevronDownIcon aria-hidden="true" />
            )}
          </Button>
        ) : null}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

interface WorkspaceTreeItemProps {
  workspace: Workspace;
  sessions: readonly Session[];
  blueprints: readonly AgentBlueprint[];
  label: string;
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
  onDownloadSession: (sessionId: string, title: string) => Promise<void>;
  onOpenWorkspaceFiles?: () => void;
  onAction: (action: () => Promise<void>, success: string) => void;
  onVisitSession: (session: Session) => void;
}

function WorkspaceTreeItem({
  workspace,
  sessions,
  blueprints,
  label,
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
}: WorkspaceTreeItemProps) {
  const visibleSessions = visibleWorkspaceSessions(
    sessions,
    workspace.id,
    activeSessionId,
    '',
    sessionLimitExpanded ? sessions.length : undefined,
  ).sort((left, right) => Number(right.pinned) - Number(left.pinned));
  const runningSessions = sessions.filter((session) => isSessionRunning(session.state));

  return (
    <Collapsible className="min-w-0" onOpenChange={onExpandedChange} open={expanded}>
      <ClioInteractiveRow
        actions={
          <WorkspaceActionsMenu
            activeWorkspaceId={activeWorkspaceId}
            actions={actions}
            label={label}
            onAction={onAction}
            onCreateSession={onCreateSession}
            onDelete={onDelete}
            onEditWorkspace={onEditWorkspace}
            onOpenWorkspaceFiles={onOpenWorkspaceFiles}
            onRename={onRename}
            workspace={workspace}
          />
        }
        className={`h-8 min-h-8 select-none gap-1.5 px-2 py-0 group-data-[collapsible=icon]:justify-center ${
          workspace.id === activeWorkspaceId
            ? 'before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
            : ''
        }`}
        data-current-workspace={workspace.id === activeWorkspaceId ? 'true' : undefined}
        selected={false}
      >
        <WorkspaceHoverCard
          label={label}
          onEditWorkspace={onEditWorkspace}
          onExpandedChange={onExpandedChange}
          onRename={onRename}
          runningCount={runningSessions.length}
          sessionCount={sessions.length}
          workspace={workspace}
          workspaceExpanded={expanded}
        />
      </ClioInteractiveRow>
      <CollapsibleContent>
        <div className="ml-3 grid min-w-0 gap-0.5 border-l pl-1.5 group-data-[collapsible=icon]:hidden">
          {visibleSessions.map((session) => (
            <SessionNavigationRow
              actions={actions}
              activeSessionId={activeSessionId}
              blueprint={blueprints.find(
                (candidate) => candidate.id === session.active_blueprint_id,
              )}
              key={session.id}
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
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No recent sessions</p>
          ) : null}
          {sessions.length > 8 ? (
            <Button
              className="h-7 w-full justify-between px-2 text-xs"
              onClick={() => setSessionLimitExpanded(!sessionLimitExpanded)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {sessionLimitExpanded
                ? 'Show recent sessions'
                : `Show all ${sessions.length} sessions`}
              {sessionLimitExpanded ? (
                <ChevronUpIcon aria-hidden="true" />
              ) : (
                <ChevronDownIcon aria-hidden="true" />
              )}
            </Button>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface WorkspaceActionsMenuProps {
  workspace: Workspace;
  label: string;
  activeWorkspaceId: string;
  actions: ResourceActions;
  onCreateSession: (workspaceId: string) => void;
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
  onCreateSession,
  onRename,
  onDelete,
  onEditWorkspace,
  onOpenWorkspaceFiles,
  onAction,
}: WorkspaceActionsMenuProps) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Workspace actions for ${label}`}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <MoreHorizontalIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Workspace actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="min-w-0">
          <span className="block truncate">{label}</span>
          <span
            className="mt-0.5 block truncate font-mono text-[10px] font-normal text-muted-foreground"
            title={workspace.path}
          >
            {workspace.path}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="whitespace-nowrap"
          onSelect={() => onCreateSession(workspace.id)}
        >
          <PlusIcon aria-hidden="true" /> New session
        </DropdownMenuItem>
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
          onSelect={() => onRename({ kind: 'workspace', id: workspace.id, label })}
        >
          <PencilIcon aria-hidden="true" /> Rename workspace
        </DropdownMenuItem>
        <DropdownMenuItem
          className="whitespace-nowrap"
          onSelect={() => void navigator.clipboard.writeText(workspace.path)}
        >
          <ClipboardIcon aria-hidden="true" /> Copy folder path
        </DropdownMenuItem>
        <DropdownMenuItem
          className="whitespace-nowrap"
          onSelect={() => onEditWorkspace(workspace.id)}
        >
          <Settings2Icon aria-hidden="true" /> Edit workspace
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="whitespace-nowrap"
          disabled={workspace.id === 'ws_default'}
          onSelect={() => onDelete({ kind: 'workspace', id: workspace.id, label })}
          variant="destructive"
        >
          <Trash2Icon aria-hidden="true" /> Remove workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface WorkspaceHoverCardProps {
  workspace: Workspace;
  label: string;
  workspaceExpanded: boolean;
  sessionCount: number;
  runningCount: number;
  onExpandedChange: (open: boolean) => void;
  onRename: (target: ResourceTarget) => void;
  onEditWorkspace: (workspaceId: string) => void;
}

function WorkspaceHoverCard({
  workspace,
  label,
  workspaceExpanded,
  sessionCount,
  runningCount,
  onExpandedChange,
  onRename,
  onEditWorkspace,
}: WorkspaceHoverCardProps) {
  const folders = workspace.source_folders?.length
    ? workspace.source_folders
    : [
        {
          name:
            workspace.path
              .split(/[\\/]+/u)
              .filter(Boolean)
              .at(-1) || workspace.path,
          path: workspace.path,
          primary: true,
        },
      ];
  return (
    <HoverCard closeDelay={100} openDelay={260}>
      <HoverCardTrigger asChild>
        <button
          aria-expanded={workspaceExpanded}
          aria-label={`${workspaceExpanded ? 'Collapse' : 'Expand'} workspace ${label}`}
          className="flex h-full w-full min-w-0 cursor-pointer items-center gap-2 text-left outline-none"
          onClick={() => onExpandedChange(!workspaceExpanded)}
          type="button"
        >
          <FolderGit2Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium group-data-[collapsible=icon]:hidden">
            {label}
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className={`ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[collapsible=icon]:hidden ${workspaceExpanded ? '' : '-rotate-90'}`}
          />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-80 overflow-hidden p-0"
        side="right"
        sideOffset={58}
      >
        <div className="border-b bg-muted/35 p-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
              <FolderGit2Icon aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <button
                className="group/name flex max-w-full items-center gap-1 rounded-sm text-left font-medium outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onRename({ kind: 'workspace', id: workspace.id, label })}
                type="button"
              >
                <span className="truncate">{label}</span>
                <PencilIcon
                  aria-hidden="true"
                  className="size-3 shrink-0 opacity-0 transition-opacity group-hover/name:opacity-100 group-focus/name:opacity-100"
                />
              </button>
              <p className="text-xs text-muted-foreground">
                {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
                {runningCount > 0 ? `, ${runningCount} active` : ''}
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-3 p-3">
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Folders
            </p>
            <div className="grid gap-1.5">
              {folders.slice(0, 4).map((folder) => (
                <div className="flex min-w-0 items-center gap-2" key={folder.path}>
                  <FolderOpenIcon
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs">{folder.name}</span>
                  {folder.primary ? (
                    <span className="text-[10px] text-muted-foreground">Primary</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <Button
            className="w-full justify-start"
            onClick={() => onEditWorkspace(workspace.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Settings2Icon aria-hidden="true" /> Edit workspace
          </Button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

interface SessionNavigationRowProps {
  session: Session;
  workspaceId: string;
  activeSessionId: string;
  seenRevision?: string;
  blueprint?: AgentBlueprint;
  actions: ResourceActions;
  onRename: (target: ResourceTarget) => void;
  onDelete: (target: ResourceTarget) => void;
  onDownloadSession: (sessionId: string, title: string) => Promise<void>;
  onAction: (action: () => Promise<void>, success: string) => void;
  onVisit: (session: Session) => void;
}

function SessionNavigationRow({
  session,
  workspaceId,
  activeSessionId,
  seenRevision,
  blueprint,
  actions,
  onRename,
  onDelete,
  onDownloadSession,
  onAction,
  onVisit,
}: SessionNavigationRowProps) {
  const running = isSessionRunning(session.state);
  const unseen =
    !running &&
    session.id !== activeSessionId &&
    seenRevision !== undefined &&
    seenRevision !== session.updated_at;
  return (
    <ClioInteractiveRow
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Session actions for ${session.title}`}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <MoreHorizontalIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem
              className="whitespace-nowrap"
              onSelect={() =>
                onAction(
                  () => actions.setSessionPinned(session.id, !session.pinned),
                  session.pinned ? 'Session unpinned' : 'Session pinned',
                )
              }
            >
              {session.pinned ? <PinOffIcon aria-hidden="true" /> : <PinIcon aria-hidden="true" />}
              {session.pinned ? 'Unpin session' : 'Pin session'}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="whitespace-nowrap"
              onSelect={() => onRename({ kind: 'session', id: session.id, label: session.title })}
            >
              <PencilIcon aria-hidden="true" /> Rename session
            </DropdownMenuItem>
            <DropdownMenuItem
              className="whitespace-nowrap"
              onSelect={() =>
                onAction(() => actions.archiveSession(session.id), 'Session archived')
              }
            >
              <ArchiveIcon aria-hidden="true" /> Archive session
            </DropdownMenuItem>
            <DropdownMenuItem
              className="whitespace-nowrap"
              onSelect={() =>
                onAction(
                  () => onDownloadSession(session.id, session.title),
                  'Session export downloaded',
                )
              }
            >
              <DownloadIcon aria-hidden="true" /> Export session
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="whitespace-nowrap"
              onSelect={() => onDelete({ kind: 'session', id: session.id, label: session.title })}
              variant="destructive"
            >
              <Trash2Icon aria-hidden="true" /> Delete session
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
      className="h-8 min-h-8 gap-1.5 px-2 py-0"
      running={running}
      selected={session.id === activeSessionId}
    >
      <HoverCard closeDelay={100} openDelay={260}>
        <HoverCardTrigger asChild>
          <Link
            className="flex h-full min-w-0 items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[active=true]:text-sidebar-foreground"
            data-active={session.id === activeSessionId}
            onClick={() => onVisit(session)}
            to={`/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(session.id)}`}
          >
            {session.pinned ? <PinIcon aria-hidden="true" className="mr-1 inline size-3" /> : null}
            <span className="min-w-0 flex-1 truncate">{session.title || 'Untitled session'}</span>
            {running ? (
              <Badge className="h-5 gap-1 px-1.5 text-[10px]" variant="secondary">
                <LoaderCircleIcon aria-hidden="true" className="size-3 animate-spin" />
                Working
              </Badge>
            ) : unseen ? (
              <Badge className="h-5 px-1.5 text-[10px]" variant="default">
                New
              </Badge>
            ) : null}
          </Link>
        </HoverCardTrigger>
        <HoverCardContent align="start" className="w-72 p-3" side="right" sideOffset={52}>
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              <button
                className="group/name flex max-w-full items-center gap-1 rounded-sm text-left font-medium outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onRename({ kind: 'session', id: session.id, label: session.title })}
                type="button"
              >
                <span className="truncate">{session.title || 'Untitled session'}</span>
                <PencilIcon
                  aria-hidden="true"
                  className="size-3 shrink-0 opacity-0 transition-opacity group-hover/name:opacity-100 group-focus/name:opacity-100"
                />
              </button>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {running ? 'Working now' : sessionStateLabel(session.state)}
              </p>
            </div>
            <Button
              aria-label={`${session.pinned ? 'Unpin' : 'Pin'} ${session.title}`}
              onClick={() =>
                onAction(
                  () => actions.setSessionPinned(session.id, !session.pinned),
                  session.pinned ? 'Session unpinned' : 'Session pinned',
                )
              }
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              {session.pinned ? <PinOffIcon aria-hidden="true" /> : <PinIcon aria-hidden="true" />}
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t pt-3 text-xs">
            <span className="text-muted-foreground">Agent</span>
            <span className="truncate">{blueprint?.display_name || 'Standard agent'}</span>
            <span className="text-muted-foreground">Model</span>
            <span className="truncate">{session.model_id || 'Inherited workspace default'}</span>
            <span className="text-muted-foreground">Working mode</span>
            <span>{sessionModeLabel(session.mode)}</span>
            <span className="text-muted-foreground">Routing</span>
            <span>{sessionRoutingLabel(session.routing_mode)}</span>
          </div>
        </HoverCardContent>
      </HoverCard>
    </ClioInteractiveRow>
  );
}

function isSessionRunning(state: Session['state']): boolean {
  return ['queued', 'running', 'waiting_permission', 'waiting_user'].includes(state);
}

function sessionModeLabel(mode: Session['mode']): string {
  return {
    edit: 'Build and edit',
    plan: 'Plan before acting',
    architect: 'Architecture',
  }[mode];
}

function sessionRoutingLabel(routing: Session['routing_mode']): string {
  return {
    auto: 'Automatic',
    chat: 'Conversation only',
    experts: 'Use domain experts',
    reasoning_only: 'Reasoning only',
  }[routing];
}

function sessionStateLabel(state: Session['state']): string {
  return (
    {
      queued: 'Queued',
      running: 'Working now',
      waiting_permission: 'Waiting for approval',
      waiting_user: 'Waiting for you',
      completed: 'Completed',
      failed: 'Needs attention',
      cancelled: 'Cancelled',
      interrupted: 'Interrupted',
    } satisfies Record<Session['state'], string>
  )[state];
}
