import type {
  AgentBlueprint,
  Artifact as ArtifactEntity,
  SessionDiff,
  SubagentRun,
  WorkspaceFileEntry,
  WorkspaceResource,
} from '@clio/core/v3';
import { Suspense, lazy, type ReactNode } from 'react';
import type { SubagentOpenTarget } from './subagent-card';
import { DiffCanvasView } from './diff-canvas-view';
import { SessionWorkView } from './session-work';
import { WorkspaceResourceBrowser } from './workspace-resource-browser';
import { ClioSubagentCanvasView } from './subagent-canvas-view';
import { ClioWorkflowCanvasView } from './workflow-canvas-view';
import { ArtifactBrowser, BlueprintBrowser, BlueprintView, FileBrowser } from './workbench-resource-browser';
import { assertNever, fileName, loadResourceViewers, type WorkbenchTab } from './workbench-shared';

const ArtifactView = lazy(() =>
  loadResourceViewers().then((module) => ({ default: module.ArtifactView })),
);
const BlueprintFileEditor = lazy(() =>
  loadResourceViewers().then((module) => ({ default: module.BlueprintFileEditor })),
);
const WorkspaceResourceCarousel = lazy(() =>
  import('./workspace-resource-view').then((module) => ({
    default: module.WorkspaceResourceCarousel,
  })),
);

function CanvasLoading({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center p-6 text-sm text-muted-foreground">{label}…</div>
  );
}

export interface WorkbenchTabContentProps {
  tab: WorkbenchTab;
  workspaceId: string;
  sessionId: string;
  files: readonly WorkspaceFileEntry[];
  filesPending?: boolean;
  filesError?: string;
  artifacts: readonly ArtifactEntity[];
  artifactsPending?: boolean;
  artifactsError?: string;
  artifactsTruncated?: 'page_cap_reached' | 'cursor_cycle_detected';
  resources: readonly WorkspaceResource[];
  resourcesPending?: boolean;
  resourcesError?: string;
  blueprints: readonly AgentBlueprint[];
  blueprintsPending?: boolean;
  blueprintsError?: string;
  diffs: readonly SessionDiff[];
  diffActionError?: string;
  diffActionPending?: boolean;
  sessionView: ReactNode;
  maximized: boolean;
  subagents: readonly SubagentRun[];
  onApplyDiff: (sessionId: string, workspaceId: string, path: string) => Promise<unknown>;
  onOpenSubagent: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  onRejectDiff: (sessionId: string, workspaceId: string, path: string) => Promise<unknown>;
  onOpenTab: (tab: WorkbenchTab) => void;
  onReplaceTab: (tabId: string, replacement: WorkbenchTab) => void;
  onSelectFilesPath: (tabId: string, path: string) => void;
  onSelectWorkspaceFilePath: (tabId: string, path: string) => void;
}

// Extracted from ClioWorkbench (which still owns tab state and callbacks) so
// that god-component stays under the file-size cap. Every case below is the
// same markup ClioWorkbench used to render inline; only the closures over
// component state (setTabs/openTab/replaceTab) became explicit props.
export function WorkbenchTabContent({
  tab,
  workspaceId,
  sessionId,
  files,
  filesPending,
  filesError,
  artifacts,
  artifactsPending,
  artifactsError,
  artifactsTruncated,
  resources,
  resourcesPending,
  resourcesError,
  blueprints,
  blueprintsPending,
  blueprintsError,
  diffs,
  diffActionError,
  diffActionPending,
  sessionView,
  maximized,
  subagents,
  onApplyDiff,
  onOpenSubagent,
  onRejectDiff,
  onOpenTab,
  onReplaceTab,
  onSelectFilesPath,
  onSelectWorkspaceFilePath,
}: WorkbenchTabContentProps): ReactNode {
  switch (tab.kind) {
    case 'work':
      return <SessionWorkView key={sessionId} sessionId={sessionId} />;
    case 'session':
      return sessionView;
    case 'files':
      return (
        <FileBrowser
          files={files}
          filesError={filesError}
          filesPending={filesPending}
          onSelectedPathChange={(path) => onSelectFilesPath(tab.id, path)}
          selectedPath={tab.path}
          workspaceId={workspaceId}
        />
      );
    case 'artifacts':
      return (
        <ArtifactBrowser
          artifacts={artifacts}
          artifactsError={artifactsError}
          artifactsPending={artifactsPending}
          artifactsTruncated={artifactsTruncated}
          defaultSplit={maximized}
          files={files}
          onReplaceArtifact={(artifact) =>
            onReplaceTab(tab.id, {
              id: `artifact:${artifact.id}`,
              kind: 'artifact',
              label: artifact.name,
              artifact,
              workspaceId: artifact.workspace_id ?? workspaceId,
            })
          }
          workspaceId={workspaceId}
        />
      );
    case 'resources':
      return (
        <WorkspaceResourceBrowser
          defaultSplit={maximized}
          error={resourcesError}
          onOpenResource={(resource) =>
            onOpenTab({
              id: `resource:${resource.id}`,
              kind: 'resource',
              label: resource.name,
              relatedResources: resources ?? [resource],
              resource,
              workspaceId: resource.workspace_id || workspaceId,
            })
          }
          pending={resourcesPending}
          resources={resources}
          workspaceId={workspaceId}
        />
      );
    case 'blueprints':
      return (
        <BlueprintBrowser
          blueprints={blueprints}
          blueprintsError={blueprintsError}
          blueprintsPending={blueprintsPending}
          onOpenBlueprint={(blueprint, event) => {
            const blueprintTab: WorkbenchTab = {
              id: `blueprint:${blueprint.id}`,
              kind: 'blueprint',
              label: blueprint.display_name,
              blueprint,
              sessionId,
              workspaceId,
            };
            if (event.shiftKey) onOpenTab(blueprintTab);
            else onReplaceTab(tab.id, blueprintTab);
          }}
        />
      );
    case 'workspace-file':
      return (
        <FileBrowser
          files={files}
          filesError={filesError}
          filesPending={filesPending}
          onSelectedPathChange={(path) => onSelectWorkspaceFilePath(tab.id, path)}
          selectedPath={tab.path}
          workspaceId={tab.workspaceId}
        />
      );
    case 'diff':
      return (
        <DiffCanvasView
          diff={
            tab.sessionId === sessionId
              ? (diffs.find((candidate) => candidate.path === tab.diff.path) ?? tab.diff)
              : tab.diff
          }
          error={diffActionError}
          onApply={(path) => onApplyDiff(tab.sessionId, tab.workspaceId, path)}
          onOpenFile={(path) =>
            onOpenTab({
              id: `workspace-file:${tab.workspaceId}:${path}`,
              kind: 'workspace-file',
              label: fileName(path),
              path,
              workspaceId: tab.workspaceId,
            })
          }
          onReject={(path) => onRejectDiff(tab.sessionId, tab.workspaceId, path)}
          pending={diffActionPending}
        />
      );
    case 'blueprint-file':
      return (
        <Suspense fallback={<CanvasLoading label="Loading blueprint file" />}>
          <BlueprintFileEditor
            blueprintId={tab.blueprintId}
            path={tab.path}
            sessionId={tab.sessionId}
            workspaceId={tab.workspaceId}
          />
        </Suspense>
      );
    case 'artifact':
      return (
        <Suspense fallback={<CanvasLoading label="Loading artifact" />}>
          <ArtifactView
            artifact={tab.artifact}
            files={tab.workspaceId === workspaceId ? files : []}
            onOpenArtifact={(artifact) =>
              onOpenTab({
                id: `artifact:${artifact.id}`,
                kind: 'artifact',
                label: artifact.name,
                artifact,
                workspaceId: artifact.workspace_id ?? tab.workspaceId,
              })
            }
            workspaceId={tab.workspaceId}
          />
        </Suspense>
      );
    case 'resource':
      return (
        <Suspense fallback={<CanvasLoading label="Loading resource" />}>
          <WorkspaceResourceCarousel
            resource={tab.resource}
            resources={tab.relatedResources}
            workspaceId={tab.workspaceId}
          />
        </Suspense>
      );
    case 'blueprint':
      return (
        <BlueprintView blueprint={tab.blueprint} sessionId={tab.sessionId} workspaceId={tab.workspaceId} />
      );
    case 'subagent':
      return (
        <ClioSubagentCanvasView
          activeSessionId={sessionId}
          onOpenArtifact={(artifact) =>
            onOpenTab({
              id: `artifact:${artifact.id}`,
              kind: 'artifact',
              label: artifact.name,
              artifact,
              workspaceId: artifact.workspace_id ?? tab.workspaceId,
            })
          }
          onOpenConversation={(subagent) => onOpenSubagent(subagent, 'conversation')}
          onOpenFile={(path) =>
            onOpenTab({
              id: `workspace-file:${path}`,
              kind: 'workspace-file',
              label: fileName(path),
              path,
              workspaceId: tab.workspaceId,
            })
          }
          onOpenSubagent={(subagent, target) => {
            if (target === 'conversation') onOpenSubagent(subagent, target);
            else
              onOpenTab({
                id: `subagent:${subagent.child_session_id ?? subagent.id}`,
                kind: 'subagent',
                label: subagent.title,
                subagent,
                workspaceId: tab.workspaceId,
              });
          }}
          subagent={tab.subagent}
          workspaceId={tab.workspaceId}
        />
      );
    case 'workflow':
      return <ClioWorkflowCanvasView onOpenSubagent={onOpenSubagent} subagents={subagents} tool={tab.tool} />;
    default:
      return assertNever(tab);
  }
}
