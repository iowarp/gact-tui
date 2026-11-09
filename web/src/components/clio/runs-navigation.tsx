import { ClioNavigation } from '@/components/clio/navigation';
import { useWorkspaceData } from '@/hooks/use-workspace-data';
import { useWorkspaceNavigationActions } from '@/hooks/use-workspace-navigation-actions';
import { buildSessionAttentionMap } from '@/lib/session-attention';
import { useConnectionSettings } from '@/providers/connection-provider';

/**
 * The left bar beside Runs: the same workspaces and conversations as a
 * conversation page, read through the shared workspace queries so moving
 * between a conversation and Runs reuses what is already loaded.
 */
export function RunsNavigation({ workspaceId }: { workspaceId: string }) {
  const { settings } = useConnectionSettings();
  const data = useWorkspaceData({
    contextTargetId: '',
    sessionId: '',
    workspaceId,
    filesViewActive: false,
  });
  const { navigationActions } = useWorkspaceNavigationActions(workspaceId, '');
  const sessions = data.allSessions.data ?? data.sessions.data ?? [];
  return (
    <ClioNavigation
      activeSessionId=""
      activeWorkspaceId={workspaceId}
      actions={navigationActions}
      agents={data.installedAgents.data ?? []}
      attentions={buildSessionAttentionMap(sessions, data.attentionInteractions)}
      endpoint={settings.endpoint}
      sessions={sessions}
      workspaces={data.workspaces.data ?? []}
    />
  );
}
