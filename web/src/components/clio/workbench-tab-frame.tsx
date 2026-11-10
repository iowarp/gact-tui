import type { Artifact, SubagentRun, WorkspaceResource } from '@clio/core/v3';
import type { ReactNode } from 'react';
import { FrameBackContext, type FrameBack } from './primitives/frame-back';
import { PresentationNavigation } from './presentation-navigation';
import type { SubagentOpenTarget } from './subagent-card';
import type { ClioWorkbenchOpenRequest } from './workbench-open-request';
import type { WorkbenchTab } from './workbench-shared';
import { WorkbenchTabErrorBoundary } from './workbench-tab-error-boundary';

/**
 * What surrounds the active tab's body: a failure stays inside the tab, links in
 * its content open through the workbench, and its frame bar gets Back to the list.
 */
export function WorkbenchTabFrame({
  artifacts,
  back,
  children,
  onClose,
  onOpen,
  onOpenSubagent,
  resources,
  sessionId,
  subagents,
  tab,
  workspaceId,
}: {
  artifacts: readonly Artifact[];
  back?: FrameBack;
  children: ReactNode;
  onClose: () => void;
  onOpen: (request: ClioWorkbenchOpenRequest, targetWorkspaceId?: string) => void;
  onOpenSubagent: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  resources: readonly WorkspaceResource[];
  sessionId: string;
  subagents: readonly SubagentRun[];
  tab: WorkbenchTab;
  workspaceId: string;
}) {
  // A foreign workspace's tab opens its links in that workspace.
  const tabWorkspaceId = 'workspaceId' in tab ? tab.workspaceId : workspaceId;
  return (
    <WorkbenchTabErrorBoundary label={tab.label} onClose={onClose}>
      <PresentationNavigation.Provider
        value={{
          workspaceId: tabWorkspaceId,
          sessionId,
          artifacts: Object.fromEntries(artifacts.map((item) => [item.id, item])),
          resources: Object.fromEntries(resources.map((item) => [item.id, item])),
          subagents: Object.fromEntries(subagents.map((item) => [item.id, item])),
          onOpenFile: (path) => onOpen({ kind: 'workspace-file', path }, tabWorkspaceId),
          onOpenFolder: (path) => onOpen({ kind: 'workspace-folder', path }, tabWorkspaceId),
          onOpenFileReference: (path, location) =>
            onOpen({ ...location, kind: 'workspace-file', path }, tabWorkspaceId),
          onOpenArtifact: (artifact) => onOpen({ kind: 'artifact', artifact }),
          onOpenResource: (resource) => onOpen({ kind: 'resource', resource }),
          onOpenSubagent,
        }}
      >
        <FrameBackContext.Provider value={back}>{children}</FrameBackContext.Provider>
      </PresentationNavigation.Provider>
    </WorkbenchTabErrorBoundary>
  );
}
