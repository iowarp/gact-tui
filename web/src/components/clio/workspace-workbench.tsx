import type { WorkspaceSourceFolder } from '@clio/core/v3';
import { useMemo } from 'react';
import type { useObservabilityNavigation } from '@/hooks/use-observability-navigation';
import type { useSessionDiffActions } from '@/hooks/use-session-diff-actions';
import type { useWorkbenchNavigation } from '@/hooks/use-workbench-navigation';
import type { useWorkspaceData } from '@/hooks/use-workspace-data';
import type { useWorkspaceTerminalActions } from '@/hooks/use-workspace-terminal-actions';
import { useSubagentControl } from '@/hooks/use-subagent-control';
import { useTaskCancellation } from '@/hooks/use-task-cancellation';
import { isDocumentPreview } from '@/lib/artifact-presentation';
import { ClioWorkbench } from './workbench';
import {
  WorkbenchActivityProvider,
  type WorkbenchActivitySource,
} from './workbench-activity-source';
import {
  type ObservabilityData,
  type ObservabilityNavigation,
  WorkspaceObservabilityView,
} from './workspace-observability';

type WorkspaceData = ReturnType<typeof useWorkspaceData>;

const NO_DIFFS: readonly never[] = [];
const NO_RESOURCES: readonly never[] = [];
/** Evidence and the event timeline are the Activity list; the tab keeps the rest. */
const TIMELINE_VIEWS = ['work', 'context'] as const;

/**
 * The side workbench: files, resources, artifacts, diffs and subagents; the
 * session's records feed its Activity list, and the Gantt and context views its
 * Timeline tab.
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
  const onCancelTask = useTaskCancellation(sessionId);
  const onControlTask = useSubagentControl(sessionId);
  const diffs = data.sessionObservability.diffs.data;
  const activity = useMemo(
    (): WorkbenchActivitySource => ({
      sessionId,
      tools: data.tools,
      processes: data.processes,
      subagents: data.subagents,
      runs: data.runs,
      tasks: data.tasks,
      interactions: data.interactions,
      diffs: diffs ?? NO_DIFFS,
      // Activity keeps every retained record the old Evidence view listed.
      artifacts: data.artifactEvidence,
      resources: workspaceResources.data ?? NO_RESOURCES,
      executionProvenance: data.executionProvenance.execution.data,
      workPages: data.workPages,
      onCancelTask,
      onControlTask,
      onOpenFlow: navigation.openFlow,
    }),
    [
      sessionId,
      data.tools,
      data.processes,
      data.subagents,
      data.runs,
      data.tasks,
      data.interactions,
      diffs,
      data.artifactEvidence,
      workspaceResources.data,
      data.executionProvenance.execution.data,
      data.workPages,
      onCancelTask,
      onControlTask,
      navigation.openFlow,
    ],
  );
  // The Artifacts list keeps every retained version and review file; previews stay in lineage.
  const artifacts = useMemo(
    () => data.artifactEvidence.filter((artifact) => !isDocumentPreview(artifact)),
    [data.artifactEvidence],
  );
  return (
    <WorkbenchActivityProvider source={activity}>
      <ClioWorkbench
        artifacts={artifacts}
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
            views={TIMELINE_VIEWS}
          />
        }
        workspaceId={workspaceId}
      />
    </WorkbenchActivityProvider>
  );
}
