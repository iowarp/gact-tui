import { artifactDisplayName } from '@/lib/dashboard-presentation';
import type {
  Artifact as ArtifactEntity,
  SessionDiff,
  SubagentRun,
  WorkspaceFileEntry,
  WorkspaceResource,
} from '@clio/core/v3';
import { Suspense, lazy, type ReactNode, type ComponentProps } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import type { SubagentOpenTarget } from './subagent-card';
import { DiffCanvasView } from './diff-canvas-view';
import { SessionWorkView } from './session-work';
import { WorkspaceResourceBrowser } from './workspace-resource-browser';
import { ClioSubagentCanvasView } from './subagent-canvas-view';
import { AgentCompositionView } from './agent-composition-view';
import { FlowRunView } from './flow-run-view';
import { ArtifactBrowser, FileBrowser } from './workbench-resource-browser';
import { WorkspaceTerminalPanel } from './workspace-terminal-panel';
const KnowledgeSourceView = lazy(() =>
  import('./knowledge-source-view').then((module) => ({ default: module.KnowledgeSourceView })),
);
import { assertNever, fileName, loadResourceViewers, type WorkbenchTab } from './workbench-shared';

const ArtifactView = lazy(() =>
  loadResourceViewers().then((module) => ({ default: module.ArtifactView })),
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
  filesFetching?: boolean;
  filesError?: string;
  filesTruncated?: boolean;
  filesNextOffset?: number | null;
  onRefreshFiles?: () => void;
  artifacts: readonly ArtifactEntity[];
  artifactsPending?: boolean;
  artifactsError?: string;
  artifactsTruncated?: 'page_cap_reached' | 'cursor_cycle_detected';
  resources: readonly WorkspaceResource[];
  resourcesPending?: boolean;
  resourcesError?: string;
  diffs: readonly SessionDiff[];
  diffActionError?: string;
  diffActionPending?: boolean;
  sessionView: ReactNode;
  /** The Agent tab before the conversation exists (a new conversation's draft agent). */
  agentView?: ReactNode;
  maximized: boolean;
  onOpenSubagent: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  onUndoDiff: (sessionId: string, workspaceId: string, changeId: string) => Promise<unknown>;
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
  filesFetching,
  filesError,
  filesTruncated,
  filesNextOffset,
  onRefreshFiles,
  artifacts,
  artifactsPending,
  artifactsError,
  artifactsTruncated,
  resources,
  resourcesPending,
  resourcesError,
  diffs,
  diffActionError,
  diffActionPending,
  sessionView,
  agentView,
  maximized,
  onOpenSubagent,
  onUndoDiff,
  onOpenTab,
  onReplaceTab,
  onSelectFilesPath,
  onSelectWorkspaceFilePath,
}: WorkbenchTabContentProps): ReactNode {
  switch (tab.kind) {
    case 'work':
      return sessionId ? <SessionWorkView key={sessionId} sessionId={sessionId} /> : sessionView;
    case 'knowledge':
      return (
        <Suspense fallback={<CanvasLoading label="Loading knowledge" />}>
          <KnowledgeSourceView workspaceId={workspaceId} sourceId={tab.sourceId} />
        </Suspense>
      );
    case 'session':
      return sessionView;
    case 'files':
      return (
        <FileBrowser
          key={`${tab.workspaceId ?? workspaceId}:${tab.directory ?? ''}`}
          directory={tab.directory}
          onClearDirectory={() => onReplaceTab(tab.id, { ...tab, directory: '', path: undefined })}
          sessionId={sessionId}
          files={files}
          filesError={filesError}
          filesFetching={filesFetching}
          filesPending={filesPending}
          filesTruncated={filesTruncated}
          filesNextOffset={filesNextOffset}
          onRefresh={onRefreshFiles}
          onSelectedPathChange={(path) => onSelectFilesPath(tab.id, path)}
          selectedPath={tab.path}
          workspaceId={tab.workspaceId ?? workspaceId}
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
              label: artifactDisplayName(artifact),
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
    case 'agent':
      return sessionId ? (
        <AgentCompositionView key={sessionId} sessionId={sessionId} />
      ) : agentView ? (
        agentView
      ) : (
        <p className="p-6 text-sm text-muted-foreground">
          The conversation&apos;s agent appears after you send your first message.
        </p>
      );
    case 'workspace-file':
      return (
        <ScopedWorkspaceFileBrowser
          sourceWorkspaceId={workspaceId}
          sessionId={sessionId}
          files={files}
          filesError={filesError}
          filesFetching={filesFetching}
          filesPending={filesPending}
          filesTruncated={filesTruncated}
          filesNextOffset={filesNextOffset}
          onRefresh={onRefreshFiles}
          onSelectedPathChange={(path) => onSelectWorkspaceFilePath(tab.id, path)}
          selectedPath={tab.path}
          searchLocation={tab.line || tab.find ? { line: tab.line, find: tab.find } : undefined}
          workspaceId={tab.workspaceId}
        />
      );
    case 'diff':
      return (
        <DiffCanvasView
          diff={
            tab.sessionId === sessionId
              ? (diffs.find((candidate) => candidate.id === tab.diff.id) ?? tab.diff)
              : tab.diff
          }
          error={diffActionError}
          onOpenFile={(path) =>
            onOpenTab({
              id: `workspace-file:${tab.workspaceId}:${path}`,
              kind: 'workspace-file',
              label: fileName(path),
              path,
              workspaceId: tab.workspaceId,
            })
          }
          onUndo={(changeId) => onUndoDiff(tab.sessionId, tab.workspaceId, changeId)}
          pending={diffActionPending}
        />
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
                label: artifactDisplayName(artifact),
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
    case 'subagent':
      return (
        <ClioSubagentCanvasView
          activeSessionId={sessionId}
          onOpenArtifact={(artifact) =>
            onOpenTab({
              id: `artifact:${artifact.id}`,
              kind: 'artifact',
              label: artifactDisplayName(artifact),
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
    case 'flow':
      return (
        <FlowRunView
          handle={tab.handle}
          label={tab.label}
          onOpenSubagent={onOpenSubagent}
          sessionId={tab.sessionId}
        />
      );
    case 'terminal':
      return <WorkspaceTerminalPanel cwd={tab.cwd} sessionId={tab.sessionId} tabId={tab.id} />;
    default:
      return assertNever(tab);
  }
}

/** A cross-workspace citation must bring its own tree as well as its own file bytes. */
function ScopedWorkspaceFileBrowser({
  sourceWorkspaceId,
  ...props
}: ComponentProps<typeof FileBrowser> & { sourceWorkspaceId: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const foreign = sourceWorkspaceId !== props.workspaceId;
  const listing = useQuery({
    queryKey: [
      'workspace-files',
      settings.endpoint,
      props.workspaceId,
      connectionScope(settings),
      'search-tab',
    ],
    queryFn: ({ signal }) => repository.workspaceFiles(props.workspaceId, signal),
    enabled: foreign,
  });
  return (
    <FileBrowser
      {...props}
      {...(foreign
        ? {
            files: listing.data?.entries ?? [],
            filesPending: listing.isPending,
            filesFetching: listing.isFetching,
            filesError: listing.error?.message,
            filesTruncated: listing.data?.truncated,
            filesNextOffset: undefined,
            onRefresh: () => {
              void listing.refetch();
            },
          }
        : {})}
    />
  );
}
