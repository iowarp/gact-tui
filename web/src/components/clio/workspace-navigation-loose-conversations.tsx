import type { Session, Workspace } from '@clio/core/v3';
import { Fragment, useState, type ReactNode } from 'react';
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar';
import { ListGroupLabel } from '@/components/clio/primitives/list-row';
import { SettingsIcon } from '@/lib/icon-vocabulary';
import type { WorkspaceDisplayLabel } from '@/lib/workspace-labels';
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
import { useConversationList } from './use-conversation-list';
import {
  DraftConversationRow,
  RailListState,
  RailLoadMore,
  RailState,
  ShowMoreRow,
} from './workspace-navigation-rail-rows';

interface LooseConversationsProps {
  /** Undefined while the workspace list is loading or failed: the conversations still list. */
  workspace: Workspace | undefined;
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
export function LooseConversations({
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
    DEFAULT_WORKSPACE_ID,
    sessions,
    true,
    expanded || filtering,
    excludedSessionIds,
  );
  const empty = total === 0 && !draft && !rail.loading && !rail.error;
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
            {workspace ? (
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
            ) : null}
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
        {empty ? <RailState kind="empty" title="No conversations yet" /> : null}
        <RailListState rail={rail} />
        {expanded && !filtering && (rail.hasMore || rail.loadingMore || rail.loadMoreError) ? (
          <RailLoadMore rail={rail} />
        ) : null}
        {total > 8 && !filtering ? (
          <ShowMoreRow
            expanded={expanded}
            railKey="more:conversations"
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
