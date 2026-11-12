import type { Session, Workspace } from '@clio/core/v3';
import { ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { ListRow } from '@/components/clio/primitives/list-row';
import { NewConversationIcon } from '@/lib/icon-vocabulary';
import { workspaceLabelText, type WorkspaceDisplayLabel } from '@/lib/workspace-labels';
import { cn } from '@/lib/utils';
import { WorkspaceMark } from './workspace-mark';
import type { ResourceActions, ResourceTarget } from './resource-dialogs';
import { WorkspaceActionsMenu } from './workspace-actions-menu';
import { nestAgentForks } from './conversation-fork-origin';
import { useConversationList } from './use-conversation-list';
import {
  DraftConversationRow,
  RailListState,
  RailLoadMore,
  RailState,
  ShowMoreRow,
} from './workspace-navigation-rail-rows';

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

export function WorkspaceTreeItem({
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
        data-rail-item={`workspace:${workspace.id}`}
        meta={
          // An open workspace shows its conversations; only a folded one counts them.
          sessionTotal > 0 && !expanded ? (
            <span className="text-caption font-normal tabular-nums text-faint">{sessionTotal}</span>
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
          {visibleSessions.length === 0 && !draft && !rail.loading && !rail.error ? (
            <RailState kind="empty" title="No conversations yet" />
          ) : null}
          <RailListState rail={rail} />
          {sessionLimitExpanded && (rail.hasMore || rail.loadingMore || rail.loadMoreError) ? (
            <RailLoadMore rail={rail} />
          ) : null}
          {sessionTotal > 8 ? (
            <ShowMoreRow
              expanded={sessionLimitExpanded}
              indent
              railKey={`more:${workspace.id}`}
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
      data-rail-focus=""
      onClick={() => onExpandedChange(!workspaceExpanded)}
      title={labelText}
      type="button"
    >
      <WorkspaceMark id={workspaceId} />
      <WorkspaceLabelFields className="group-data-[collapsible=icon]:hidden" label={label} />
    </button>
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
        <span className="shrink-0 text-meta font-normal text-muted-foreground" key={qualifier}>
          {qualifier}
        </span>
      ))}
    </span>
  );
}
