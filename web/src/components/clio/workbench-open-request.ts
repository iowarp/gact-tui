import type {
  Artifact as ArtifactEntity,
  SessionDiff,
  SubagentRun,
  WorkspaceResource,
} from '@clio/core/v3';
import { artifactDisplayName } from '@/lib/dashboard-presentation';
import { workspaceFilePath } from '@/lib/workspace-file-path';
import { useLiveStore } from '@/store/live-store';
import type { ObservabilityView } from './observability-view-storage';
import { activityTab } from './workbench-activity-tab';
import { fileName, type WorkbenchTab } from './workbench-shared';

export type CanvasResourceKind =
  | 'session'
  | 'work'
  | 'files'
  | 'resources'
  | 'artifacts'
  | 'agent'
  | 'science-log';

export type ClioWorkbenchOpenRequest =
  | { kind: 'knowledge'; sourceId: string; label: string }
  | {
      kind: 'workspace-file';
      path: string;
      workspaceId?: string;
      line?: number;
      find?: string;
      locator?: string;
    }
  | { kind: 'workspace-folder'; path: string; workspaceId?: string }
  | { kind: 'diff'; diff: SessionDiff }
  | { kind: 'artifact'; artifact: ArtifactEntity }
  | {
      kind: 'resource';
      resource: WorkspaceResource;
      relatedResources?: readonly WorkspaceResource[];
    }
  | { kind: 'subagent'; subagent: SubagentRun }
  /** A flow run (a workflow, a council, ...) recorded under the task `handle`. */
  | { kind: 'flow'; handle: string; label?: string }
  | { kind: 'resources'; section?: Exclude<CanvasResourceKind, 'session'> }
  /** `view` names the timeline tab's view; without one, Activity shows its list. */
  | { kind: 'session'; view?: ObservabilityView }
  /** The Science log tab, as `openView` opens a study view in it. */
  | { kind: 'science-log' }
  | { kind: 'terminal'; cwd: string }
  /** One page of the shared browser, labelled by its session (a subagent's by its task). */
  | { kind: 'browser'; pageId: string; sessionId?: string; label?: string }
  /** One tool call's Activity detail, in the session that made it. */
  | { kind: 'tool-call'; callId: string; sessionId?: string; label: string }
  /** A variant run's tries as tabs, `tryIndex` in front. */
  | {
      kind: 'variant-try';
      variantsId: string;
      tryIndex: number;
      tries: readonly { tryIndex: number; label: string }[];
      sessionId?: string;
    };

/** The requests whose tab depends only on the request and the conversation. */
export type TabOpenRequest = Exclude<
  ClioWorkbenchOpenRequest,
  { kind: 'subagent' | 'resources' | 'session' | 'science-log' }
>;

/** The tab an open request makes, for the current conversation and workspace. */
export function tabForOpenRequest(
  request: TabOpenRequest,
  sessionId: string,
  workspaceId: string,
  requestedWorkspaceId: string = workspaceId,
): WorkbenchTab {
  switch (request.kind) {
    case 'workspace-folder': {
      const target = request.workspaceId ?? requestedWorkspaceId;
      return {
        id: target === workspaceId ? 'files' : `files:${target}`,
        kind: 'files',
        label: 'Files',
        workspaceId: target,
        directory: request.path === '.' ? '' : request.path,
      };
    }
    case 'knowledge':
      return {
        id: `knowledge:${request.sourceId}`,
        kind: 'knowledge',
        sourceId: request.sourceId,
        label: request.label,
        workspaceId,
      };
    case 'workspace-file': {
      const target = request.workspaceId ?? requestedWorkspaceId;
      const root = useLiveStore.getState().entities.workspaces[target]?.path;
      const path = workspaceFilePath(request.path, root);
      return {
        id: `workspace-file:${target === workspaceId ? '' : `${target}:`}${path}`,
        kind: 'workspace-file',
        label: fileName(path),
        path,
        workspaceId: target,
        line: request.line,
        find: request.find,
        locator: request.locator,
      };
    }
    case 'diff':
      return {
        id: `diff:${sessionId}:${request.diff.path}`,
        kind: 'diff',
        label: fileName(request.diff.path),
        diff: request.diff,
        sessionId,
        workspaceId,
      };
    case 'artifact':
      return {
        id: `artifact:${request.artifact.id}`,
        kind: 'artifact',
        label: artifactDisplayName(request.artifact),
        artifact: request.artifact,
        workspaceId: request.artifact.workspace_id ?? workspaceId,
      };
    case 'resource':
      return {
        id: `resource:${request.resource.id}`,
        kind: 'resource',
        label: request.resource.name,
        relatedResources: request.relatedResources ?? [request.resource],
        resource: request.resource,
        workspaceId: request.resource.workspace_id || workspaceId,
      };
    case 'flow':
      return {
        id: `flow:${request.handle}`,
        kind: 'flow',
        label: request.label ?? 'Flow run',
        handle: request.handle,
        sessionId,
        workspaceId,
      };
    case 'terminal':
      return {
        id: `terminal:${sessionId}`,
        kind: 'terminal',
        label: 'Terminal',
        cwd: request.cwd,
        sessionId,
        workspaceId,
      };
    case 'browser':
      return {
        id: `browser:${request.pageId}`,
        kind: 'browser',
        label: request.label || 'Browser',
        pageId: request.pageId,
        sessionId: request.sessionId ?? sessionId,
        workspaceId,
      };
    case 'tool-call':
      return activityTab(
        { id: `tool:${request.callId}`, kind: 'tool', name: request.label },
        request.sessionId ?? sessionId,
        workspaceId,
      );
    case 'variant-try':
      return variantTryTab(request, request.tryIndex, sessionId, workspaceId);
  }
}

/** One try's tab of a `variant-try` request. */
export function variantTryTab(
  request: Extract<ClioWorkbenchOpenRequest, { kind: 'variant-try' }>,
  tryIndex: number,
  sessionId: string,
  workspaceId: string,
): WorkbenchTab {
  return {
    id: `variant-try:${request.variantsId}:${tryIndex}`,
    kind: 'variant-try',
    label: request.tries.find((item) => item.tryIndex === tryIndex)?.label ?? `Try ${tryIndex + 1}`,
    variantsId: request.variantsId,
    tryIndex,
    sessionId: request.sessionId ?? sessionId,
    workspaceId,
  };
}
