import type { WorkspaceSourceFolder } from '@clio/core/v3';
import type { RunState } from '@clio/core/v3';
import type { RefObject } from 'react';
import type { useObservabilityNavigation } from '@/hooks/use-observability-navigation';
import type { useWorkbenchNavigation } from '@/hooks/use-workbench-navigation';
import type { useWorkspaceData } from '@/hooks/use-workspace-data';
import {
  WorkspaceLiveObservabilityDock,
  WorkspaceLiveObservabilityView,
} from './workspace-live-projections';

type WorkspaceData = ReturnType<typeof useWorkspaceData>;
type WorkbenchNavigation = ReturnType<typeof useWorkbenchNavigation>;

/** The session data both observability surfaces read. */
export type ObservabilityData = Pick<
  WorkspaceData,
  | 'artifactEvidence'
  | 'artifacts'
  | 'context'
  | 'contextObservability'
  | 'contextTargetOptions'
  | 'executionProvenance'
  | 'familyObservability'
  | 'interactions'
  | 'processes'
  | 'runs'
  | 'sessionContext'
  | 'sessionObservability'
  | 'subagents'
  | 'tasks'
  | 'tools'
  | 'workPages'
  | 'workspaceResources'
>;

export type ObservabilityNavigation = Pick<
  WorkbenchNavigation,
  | 'openArtifact'
  | 'openDiff'
  | 'openFlow'
  | 'openSubagent'
  | 'openWorkspaceFile'
  | 'openWorkspaceResource'
  | 'revealWorkbench'
>;

/** Props the toolbar dock and the session view take identically. */
function sharedProps(
  data: ObservabilityData,
  navigation: ObservabilityNavigation,
  sessionId: string,
) {
  const provenance = data.executionProvenance;
  return {
    ...data.familyObservability,
    artifactProvenanceProvider: provenance.providers.data?.artifact,
    context: data.context,
    executionProvenance: provenance.execution.data,
    interactions: data.interactions,
    onOpenArtifact: navigation.openArtifact,
    onOpenDiff: navigation.openDiff,
    onOpenFile: navigation.openWorkspaceFile,
    onOpenFlow: navigation.openFlow,
    onOpenResource: navigation.openWorkspaceResource,
    onOpenSubagent: navigation.openSubagent,
    onProvenanceProviderChange: provenance.setProvider,
    processes: data.processes,
    provenanceDegradation: provenance.degradation,
    provenancePending: provenance.providers.isPending || provenance.execution.isPending,
    provenanceProvider: provenance.provider,
    provenanceProviders: provenance.providers.data?.providers,
    resources: data.workspaceResources.data ?? [],
    runs: data.runs,
    sessionId,
    subagents: data.subagents,
    tasks: data.tasks,
    tools: data.tools,
    workPages: data.workPages,
  };
}

/** The session's observability summary in the shell toolbar. */
export function WorkspaceObservabilityDock({
  data,
  navigation,
  sessionId,
  workspaceId,
  sessionState,
  surfaceRef,
  onOpenCanvas,
  onOpenWork,
}: {
  data: ObservabilityData;
  navigation: ObservabilityNavigation;
  sessionId: string;
  workspaceId: string;
  sessionState: RunState;
  surfaceRef: RefObject<HTMLElement | null>;
  onOpenCanvas: ReturnType<typeof useObservabilityNavigation>['openObservability'];
  onOpenWork: () => void;
}) {
  const observability = data.sessionObservability;
  return (
    <WorkspaceLiveObservabilityDock
      {...sharedProps(data, navigation, sessionId)}
      toolbar
      surfaceRef={surfaceRef}
      workspaceId={workspaceId}
      artifacts={data.artifacts}
      contextFiles={observability.contextFiles.data ?? []}
      contextFrames={observability.contextFrames.data ?? []}
      diffs={observability.diffs.data ?? []}
      onOpenCanvas={onOpenCanvas}
      onOpenWork={onOpenWork}
      onOpenBrowser={navigation.revealWorkbench}
      sessionState={sessionState}
    />
  );
}

/** The session's full observability view inside the workbench. */
export function WorkspaceObservabilityView({
  data,
  navigation,
  sessionId,
  requestedView,
  contextTargetId,
  onContextTargetChange,
  workspaceFolders,
}: {
  data: ObservabilityData;
  navigation: ObservabilityNavigation;
  sessionId: string;
  requestedView: ReturnType<typeof useObservabilityNavigation>['requestedView'];
  contextTargetId: string;
  onContextTargetChange: (targetId: string) => void;
  /** Folders the session may write besides the workspace (Evidence lists them). */
  workspaceFolders?: readonly WorkspaceSourceFolder[];
}) {
  const { contextObservability, sessionContext, sessionObservability } = data;
  return (
    <WorkspaceLiveObservabilityView
      {...sharedProps(data, navigation, sessionId)}
      requestedView={requestedView}
      artifacts={data.artifactEvidence}
      contextError={sessionContext.state.error?.message}
      contextFiles={contextObservability.contextFiles.data ?? []}
      contextFilesError={contextObservability.contextFiles.error?.message}
      contextFilesPending={contextObservability.contextFiles.isPending}
      contextFrames={contextObservability.contextFrames.data ?? []}
      contextFramesError={contextObservability.contextFrames.error?.message}
      contextFramesPending={contextObservability.contextFrames.isPending}
      contextPreferencesPending={sessionContext.preferences.isPending}
      contextTargets={data.contextTargetOptions}
      compactContextPending={sessionContext.compactPending}
      diffs={sessionObservability.diffs.data ?? []}
      diffsError={sessionObservability.diffs.error?.message}
      diffsPending={sessionObservability.diffs.isPending}
      processesError={sessionObservability.processes.error?.message}
      processesPending={sessionObservability.processes.isPending}
      onCompactContext={() => sessionContext.compact.mutateAsync()}
      onContextTargetChange={onContextTargetChange}
      onUpdateContextPreferences={(input) => sessionContext.preferences.mutateAsync(input)}
      selectedContextTargetId={contextTargetId}
      workspaceFolders={workspaceFolders}
    />
  );
}
