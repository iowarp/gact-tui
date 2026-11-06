import type { Session } from '@clio/core/v3';
import { useNavigate } from 'react-router-dom';
import type { useSessionHistoryActions } from '@/hooks/use-session-history-actions';
import type { useWorkspaceNavigationActions } from '@/hooks/use-workspace-navigation-actions';
import type { useWorkspaceTerminalActions } from '@/hooks/use-workspace-terminal-actions';
import { ClioSessionContextBar } from './session-context-bar';

/**
 * The session's title bar: its agent, its parent, and the history actions
 * (fork, compact, undo, share) with their shared pending state.
 */
export function WorkspaceContextBar({
  session,
  parentSession,
  agentLabel,
  endpoint,
  history,
  navigationActions,
  terminalActions,
  onOpenAgent,
}: {
  session: Session;
  parentSession: Session | undefined;
  agentLabel: string | undefined;
  endpoint: string;
  history: ReturnType<typeof useSessionHistoryActions>;
  navigationActions: ReturnType<typeof useWorkspaceNavigationActions>['navigationActions'];
  terminalActions: ReturnType<typeof useWorkspaceTerminalActions>;
  onOpenAgent: () => void;
}) {
  const navigate = useNavigate();
  return (
    <ClioSessionContextBar
      agentLabel={agentLabel}
      management={{ session, actions: navigationActions, endpoint }}
      actionsPending={
        history.fork.isPending ||
        history.compact.isPending ||
        history.undo.isPending ||
        history.rewind.isPending ||
        history.share.isPending
      }
      onCompact={async () => {
        await history.compact.mutateAsync();
      }}
      onFork={async () => {
        await history.fork.mutateAsync(undefined);
      }}
      onOpenAgent={onOpenAgent}
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
