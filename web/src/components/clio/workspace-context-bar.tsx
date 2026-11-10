import type { Session } from '@clio/core/v3';
import { useNavigate } from 'react-router-dom';
import type { useSessionHistoryActions } from '@/hooks/use-session-history-actions';
import type { useWorkspaceNavigationActions } from '@/hooks/use-workspace-navigation-actions';
import type { useWorkspaceTerminalActions } from '@/hooks/use-workspace-terminal-actions';
import { ClioSessionContextBar } from './session-context-bar';

/**
 * The conversation's breadcrumb: its workspace, its parent, and the history actions
 * (fork, compact, undo, share) with their shared pending state.
 */
export function WorkspaceContextBar({
  session,
  parentSession,
  workspaceLabel,
  endpoint,
  history,
  navigationActions,
  terminalActions,
  onOpenWorkspace,
}: {
  session: Session;
  parentSession: Session | undefined;
  workspaceLabel: string | undefined;
  endpoint: string;
  history: ReturnType<typeof useSessionHistoryActions>;
  navigationActions: ReturnType<typeof useWorkspaceNavigationActions>['navigationActions'];
  terminalActions: ReturnType<typeof useWorkspaceTerminalActions>;
  onOpenWorkspace?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <ClioSessionContextBar
      workspaceLabel={workspaceLabel}
      management={{ session, actions: navigationActions, endpoint }}
      actionsPending={history.isPending}
      onCompact={async () => {
        await history.compact.mutateAsync();
      }}
      onFork={async () => {
        await history.fork.mutateAsync(undefined);
      }}
      onOpenWorkspace={onOpenWorkspace}
      onOpenSystemTerminal={terminalActions.onOpenSystemTerminal}
      onReturnToParent={(parent) =>
        navigate(
          `/workspaces/${encodeURIComponent(parent.workspace_id)}/sessions/${encodeURIComponent(parent.id)}`,
        )
      }
      onShare={async (ttlSeconds) => (await history.share.mutateAsync(ttlSeconds)).url}
      onUndo={async () => {
        await history.undo.mutateAsync();
      }}
      parentSession={parentSession}
      session={session}
    />
  );
}
