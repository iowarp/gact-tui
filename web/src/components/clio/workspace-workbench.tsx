import type { WorkspaceSourceFolder } from '@clio/core/v3';
import type { useObservabilityNavigation } from '@/hooks/use-observability-navigation';
import type { useSessionDiffActions } from '@/hooks/use-session-diff-actions';
import type { useWorkbenchNavigation } from '@/hooks/use-workbench-navigation';
import type { useWorkspaceData } from '@/hooks/use-workspace-data';
import type { useWorkspaceTerminalActions } from '@/hooks/use-workspace-terminal-actions';
import { ClioWorkbench } from './workbench';
import {
  type ObservabilityData,
  type ObservabilityNavigation,
  WorkspaceObservabilityView,
} from './workspace-observability';

type WorkspaceData = ReturnType<typeof useWorkspaceData>;

/**
 * The side workbench: files, resources, artifacts, diffs and subagents, with
 * the session's observability view as its session tab.
 */
export function WorkspaceWorkbench({
  data,
  navigation,
  sessionId,
  workspaceId,
  endpoint,
  inStudy,
  diffActions,
  terminalActions,
  requestedView,
  contextTargetId,
  onContextTargetChange,
  onFilesViewActiveChange,
  workspaceFolders,
}: {
  data: ObservabilityData & Pick<WorkspaceData, 'sessionArtifacts' | 'workspaceFiles'>;
  navigation: ObservabilityNavigation & Pick<ReturnType<typeof useWorkbenchNavigation>, 'requests'>;
  sessionId: string;
  workspaceId: string;
  /** The connected service; a new one starts a fresh workbench. */
  endpoint: string;
  inStudy: boolean | undefined;
  /** Folders the session may write besides the workspace (Evidence lists them). */
  workspaceFolders?: readonly WorkspaceSourceFolder[];
  diffActions: ReturnType<typeof useSessionDiffActions>;
  terminalActions: ReturnType<typeof useWorkspaceTerminalActions>;
  requestedView: ReturnType<typeof useObservabilityNavigation>['requestedView'];
  contextTargetId: string;
  onContextTargetChange: (targetId: string) => void;
  onFilesViewActiveChange: (active: boolean) => void;
}) {
  const { sessionArtifacts, workspaceFiles, workspaceResources } = data;
  return (
    <ClioWorkbench
      artifacts={data.artifacts}
      artifactsError={sessionArtifacts.error?.message}
      artifactsPending={sessionArtifacts.isPending}
      artifactsTruncated={sessionArtifacts.data?.truncated}
      diffActionError={diffActions.undo.error?.message}
      diffActionPending={diffActions.undo.isPending}
      diffs={data.sessionObservability.diffs.data ?? []}
      files={workspaceFiles.data?.entries ?? []}
      filesError={workspaceFiles.error?.message}
      filesFetching={workspaceFiles.isFetching}
      filesPending={workspaceFiles.isPending}
      filesTruncated={workspaceFiles.data?.truncated ?? false}
      filesNextOffset={workspaceFiles.data?.next_offset}
      onFilesViewActiveChange={onFilesViewActiveChange}
      onRefreshFiles={() => void workspaceFiles.refetch()}
      resources={workspaceResources.data ?? []}
      resourcesError={workspaceResources.error?.message}
      resourcesPending={workspaceResources.isPending}
      onOpenTerminal={terminalActions.onOpenTerminal}
      onOpenSubagent={navigation.openSubagent}
      subagents={data.subagents}
      finishedWorkHidden={Boolean(data.workPages?.hasMore || data.workPages?.history)}
      inStudy={inStudy}
      onUndoDiff={(targetSessionId, targetWorkspaceId, changeId) =>
        diffActions.undo.mutateAsync({
          sessionId: targetSessionId,
          workspaceId: targetWorkspaceId,
          changeId,
        })
      }
      key={endpoint}
      requests={navigation.requests}
      sessionId={sessionId}
      sessionView={
        <WorkspaceObservabilityView
          data={data}
          navigation={navigation}
          sessionId={sessionId}
          requestedView={requestedView}
          contextTargetId={contextTargetId}
          onContextTargetChange={onContextTargetChange}
          workspaceFolders={workspaceFolders}
        />
      }
      workspaceId={workspaceId}
    />
  );
}
