import type {
  AgentBlueprintReference,
  Artifact as ArtifactEntity,
  SessionDiff,
  SubagentRun,
  ToolInvocation,
  WorkspaceResource,
} from '@clio/core/v3';

export type WorkbenchTab =
  | { id: 'work'; kind: 'work'; label: 'Work' }
  | { id: 'session'; kind: 'session'; label: 'Observability' }
  | { id: 'files'; kind: 'files'; label: 'Files'; path?: string }
  | { id: 'artifacts'; kind: 'artifacts'; label: 'Artifacts' }
  | { id: 'blueprints'; kind: 'blueprints'; label: 'Blueprints' }
  | { id: 'resources'; kind: 'resources'; label: 'Resources' }
  | { id: string; kind: 'workspace-file'; label: string; path: string; workspaceId: string }
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
      kind: 'blueprint-file';
      label: string;
      path: string;
      blueprintId: string;
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
      kind: 'blueprint';
      label: string;
      blueprint: AgentBlueprintReference;
      sessionId: string;
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
      kind: 'workflow';
      label: string;
      tool: ToolInvocation;
      workspaceId: string;
    };

export function fileName(path: string): string {
  return (
    path
      .split(/[\\/]+/)
      .filter(Boolean)
      .at(-1) ?? path
  );
}

export function assertNever(value: never): never {
  throw new Error(`Unsupported workbench item: ${JSON.stringify(value)}`);
}

// A shared factory (not a shared promise) so each importer's lazy() call
// still dedupes through the browser/bundler module cache on './resource-viewers'.
export const loadResourceViewers = () => import('./resource-viewers');
