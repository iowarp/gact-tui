import type { AgentBlueprint, Session, Workspace } from '@clio/core/v3';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardIcon,
  FolderGit2Icon,
  FolderOpenIcon,
  PinIcon,
  PinOffIcon,
} from 'lucide-react';
import { AddIcon, DeleteIcon, EditIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { useMemo, useState } from 'react';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { copyText } from '@/lib/clipboard';
import { resolveActiveBlueprint } from '@/lib/active-blueprint';
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
import { ClioInteractiveRow } from './interactive-row';
import type { ResourceActions, ResourceTarget } from './resource-dialogs';
import { SessionNavigationRow } from './workspace-navigation-session-row';

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
  onDownloadSession: (
    sessionId: string,
    title: string,
    mode: import('@clio/core/v3').SessionExportMode,
  ) => Promise<void>;
  onOpenWorkspaceFiles?: () => void;
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
  attentions,
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

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
      <SidebarGroupContent className="grid min-w-0 gap-1">
        {visibleWorkspaces.map((workspace) => {
          const workspaceSessions = sessions.filter(
            (session) =>
              session.workspace_id === workspace.id &&
              !session.archived &&
              isPrimarySession(session),
          );
          const expanded = workspaceExpansion[workspace.id] ?? workspace.id === activeWorkspaceId;
          return (
            <WorkspaceTreeItem
              actions={actions}
              attentions={attentions}
              activeSessionId={activeSessionId}
              activeWorkspaceId={activeWorkspaceId}
              blueprints={blueprints}
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
              setSessionLimitExpanded={(open) =>
                setExpandedSessionsFor(open ? workspace.id : undefined)
              }
              workspace={workspace}
            />
          );
        })}
        {workspaces.length > VISIBLE_WORKSPACE_LIMIT ? (
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
  label: WorkspaceDisplayLabel;
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
  attentions,
}: WorkspaceTreeItemProps) {
  const visibleSessions = visibleWorkspaceSessions(
    sessions,
    workspace.id,
    '',
    sessionLimitExpanded ? sessions.length : undefined,
  ).sort((left, right) => Number(right.pinned) - Number(left.pinned));

  return (
    <Collapsible className="min-w-0" onOpenChange={onExpandedChange} open={expanded}>
      <ClioInteractiveRow
        appearance="navigation"
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={`New session in ${workspaceLabelText(label)}`}
                  onClick={() => onCreateSession(workspace.id)}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <AddIcon aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New session</TooltipContent>
            </Tooltip>
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
          </>
        }
        className={`h-8 min-h-8 select-none gap-1.5 px-2 py-0 group-data-[collapsible=icon]:justify-center ${
          workspace.id === activeWorkspaceId
            ? 'before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
            : ''
        }`}
        data-current-workspace={workspace.id === activeWorkspaceId ? 'true' : undefined}
        selected={false}
      >
        <WorkspaceDisclosureButton
          label={label}
          onExpandedChange={onExpandedChange}
          workspaceExpanded={expanded}
        />
      </ClioInteractiveRow>
      <CollapsibleContent>
        <div className="ml-2 grid min-w-0 gap-0.5 pl-2 group-data-[collapsible=icon]:hidden">
          {visibleSessions.map((session) => (
            <SessionNavigationRow
              actions={actions}
              activeSessionId={activeSessionId}
              attention={attentions[session.id]}
              blueprint={resolveActiveBlueprint(session, blueprints)}
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
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No sessions</p>
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
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Workspace actions for ${labelText}`}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <MoreIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Workspace actions</TooltipContent>
      </Tooltip>
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
  workspaceExpanded: boolean;
  onExpandedChange: (open: boolean) => void;
}

function WorkspaceDisclosureButton({
  label,
  workspaceExpanded,
  onExpandedChange,
}: WorkspaceDisclosureButtonProps) {
  const labelText = workspaceLabelText(label);
  return (
    <button
      aria-expanded={workspaceExpanded}
      aria-label={`${workspaceExpanded ? 'Collapse' : 'Expand'} workspace ${labelText}`}
      className="flex h-full w-full min-w-0 cursor-pointer items-center gap-2 text-left outline-none"
      onClick={() => onExpandedChange(!workspaceExpanded)}
      type="button"
    >
      <FolderGit2Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
      <WorkspaceLabelFields className="group-data-[collapsible=icon]:hidden" label={label} />
    </button>
  );
}
