import type {
  Artifact as ArtifactEntity,
  SessionDiff,
  SubagentRun,
  WorkspaceResource,
} from '@clio/core/v3';
import type { ActivityKind } from './workbench-activity-model';
import type { WorkbenchListView, WorkbenchTabListView } from './workbench-strip';

/**
 * An item picked in a list tab takes that tab's place; `backTo` names the
 * list, and the frame bar's Back returns to it.
 */
export type WorkbenchTab = WorkbenchTabKind & { backTo?: WorkbenchListView };

type WorkbenchTabKind =
  | { id: string; kind: 'knowledge'; sourceId: string; label: string; workspaceId: string }
  | { id: 'work'; kind: 'work'; label: 'Work' }
  /** One Activity row's detail: a tool call, a task, a question, a source. */
  | {
      id: string;
      kind: 'activity';
      label: string;
      itemId: string;
      activityKind: ActivityKind;
      sessionId: string;
      workspaceId: string;
    }
  | {
      id: string;
      kind: 'files';
      label: 'Files';
      path?: string;
      directory?: string;
      workspaceId?: string;
    }
  | { id: 'artifacts'; kind: 'artifacts'; label: 'Artifacts' }
  | { id: 'agent'; kind: 'agent'; label: 'Agent' }
  | { id: 'resources'; kind: 'resources'; label: 'Resources' }
  | { id: 'science-log'; kind: 'science-log'; label: 'Science log' }
  /** A strip list (Files, Sources, Artifacts, Activity, Terminal, Browser pages) as a tab. */
  | { id: `list:${WorkbenchTabListView}`; kind: 'list'; label: string; view: WorkbenchTabListView }
  | {
      id: string;
      kind: 'workspace-file';
      label: string;
      path: string;
      workspaceId: string;
      line?: number;
      find?: string;
      locator?: string;
    }
  | {
      id: string;
      kind: 'diff';
      label: string;
      diff: SessionDiff;
      sessionId: string;
      workspaceId: string;
    }
  | {
      id: string;
      kind: 'artifact';
      label: string;
      artifact: ArtifactEntity;
      workspaceId: string;
    }
  | {
      id: string;
      kind: 'resource';
      label: string;
      relatedResources: readonly WorkspaceResource[];
      resource: WorkspaceResource;
      workspaceId: string;
    }
  | {
      id: string;
      kind: 'subagent';
      label: string;
      subagent: SubagentRun;
      workspaceId: string;
    }
  | {
      id: string;
      kind: 'flow';
      label: string;
      handle: string;
      sessionId: string;
      workspaceId: string;
    }
  | {
      id: string;
      kind: 'terminal';
      label: string;
      cwd: string;
      sessionId: string;
      workspaceId: string;
    }
  | {
      id: string;
      kind: 'browser';
      label: string;
      pageId: string;
      sessionId: string;
      workspaceId: string;
    };

export function subagentTab(subagent: SubagentRun, workspaceId: string): WorkbenchTab {
  return {
    id: `subagent:${subagent.child_session_id ?? subagent.id}`,
    kind: 'subagent',
    label: subagent.title,
    subagent,
    workspaceId,
  };
}

export function fileName(path: string): string {
  return (
    path
      .split(/[\\/]+/)
      .filter(Boolean)
      .at(-1) ?? path
  );
}

/** Whether a path is one the conversation changed (diff paths may be absolute). */
export function isChangedPath(changed: ReadonlySet<string> | undefined, path: string): boolean {
  if (!changed?.size) return false;
  const normalized = path.replace(/\\/gu, '/');
  if (changed.has(normalized)) return true;
  for (const candidate of changed) if (candidate.endsWith(`/${normalized}`)) return true;
  return false;
}

/** The set of paths a conversation's diffs touched, with forward slashes. */
export function changedPathSet(diffs: readonly SessionDiff[]): ReadonlySet<string> {
  return new Set(diffs.map((diff) => diff.path.replace(/\\/gu, '/')));
}

export function assertNever(value: never): never {
  throw new Error(`Unsupported workbench item: ${JSON.stringify(value)}`);
}

// A shared factory (not a shared promise) so each importer's lazy() call
// still dedupes through the browser/bundler module cache on './resource-viewers'.
export const loadResourceViewers = () => import('./resource-viewers');
