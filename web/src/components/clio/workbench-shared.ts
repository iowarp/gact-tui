import type {
  Artifact as ArtifactEntity,
  SessionDiff,
  SubagentRun,
  WorkspaceResource,
} from '@clio/core/v3';
import type { CommandMenuScope } from '@/lib/command-menu-scopes';
import type { ActivityKind } from './workbench-activity-model';
import type { WorkbenchListView, WorkbenchTabListView } from './workbench-strip';

/**
 * An item picked in a list tab takes that tab's place; `backTo` names the
 * list, and the frame bar's Back returns to it.
 */
export type WorkbenchTab = WorkbenchTabKind & { backTo?: WorkbenchListView };

type WorkbenchTabKind =
  | { id: string; kind: 'knowledge'; sourceId: string; label: string; workspaceId: string }
  /** The NDP catalog, browsed as a Files tree. */
  | { id: string; kind: 'ndp'; label: string; workspaceId: string }
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
  | {
      id: `list:${WorkbenchTabListView}` | `list:browser:new${string}`;
      kind: 'list';
      label: string;
      view: WorkbenchTabListView;
      /** A new browser page: the Browser list with its address field open, one per press. */
      newPage?: true;
    }
  | {
      id: string;
      kind: 'workspace-file';
      label: string;
      path: string;
      workspaceId: string;
      line?: number;
      find?: string;
      locator?: string;
      /** PDF only: the page the viewer opens on. */
      page?: number;
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
    }
  /** An MCP App in its fullscreen display mode: the one frame of that App (MA1). */
  | ({ id: `mcp-app:${string}`; kind: 'mcp-app' } & McpAppTabTarget)
  /** Ctrl K's results for `query`, moved into a tab (All results). */
  | { id: string; kind: 'search'; label: string; query: string; scope?: CommandMenuScope }
  /** One try of a variant run (BestOfN / Refine); the run's pick card picks between them. */
  | {
      id: string;
      kind: 'variant-try';
      label: string;
      variantsId: string;
      tryIndex: number;
      sessionId: string;
      workspaceId: string;
    };

/** What an `mcp-app` tab carries: the App's identity and a label from its tool. */
export interface McpAppTabTarget {
  label: string;
  appInstanceId: string;
  dataRef: string;
  sessionId: string;
  resourceUri: string;
  sourceServer: string;
  toolName: string;
}

export function mcpAppTab(target: McpAppTabTarget): WorkbenchTab {
  return { ...target, id: `mcp-app:${target.appInstanceId}` as const, kind: 'mcp-app' };
}

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

/** Lines each applied change added, by forward-slash path. */
export type ChangeCounts = ReadonlyMap<string, number>;

export function changeCountMap(diffs: readonly SessionDiff[]): ChangeCounts {
  const counts = new Map<string, number>();
  for (const diff of diffs) {
    if (diff.status !== 'applied' || !diff.lines_added) continue;
    const path = diff.path.replace(/\\/gu, '/');
    counts.set(path, (counts.get(path) ?? 0) + diff.lines_added);
  }
  return counts;
}

/** The lines added to a path (diff paths may be absolute), if any were recorded. */
export function changeCountFor(counts: ChangeCounts | undefined, path: string): number | undefined {
  if (!counts?.size) return undefined;
  const normalized = path.replace(/\\/gu, '/');
  const exact = counts.get(normalized);
  if (exact !== undefined) return exact;
  for (const [candidate, count] of counts) if (candidate.endsWith(`/${normalized}`)) return count;
  return undefined;
}

/** Under this the workbench slides over the conversation instead of sitting beside it. */
export const SPLIT_WORKBENCH_QUERY = '(min-width: 900px)';

/**
 * A list header's secondary actions (refresh, hide), which the spec does not
 * draw: on a pointer that hovers they show only while the header is hovered
 * or holds focus; touch keeps them visible.
 */
export const LIST_HEADER_SECONDARY =
  'inline-flex transition-opacity duration-150 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/list-header:opacity-100 [@media(hover:hover)]:group-focus-within/list-header:opacity-100 [@media(hover:hover)]:has-[[aria-busy=true]]:opacity-100';

export function assertNever(value: never): never {
  throw new Error(`Unsupported workbench item: ${JSON.stringify(value)}`);
}

// A shared factory (not a shared promise) so each importer's lazy() call
// still dedupes through the browser/bundler module cache on './resource-viewers'.
export const loadResourceViewers = () => import('./resource-viewers');
