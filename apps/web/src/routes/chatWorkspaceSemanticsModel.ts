/**
 * Pure helpers for workspace semantics: maps API workspace rows to options
 * and filters/resolves the active workspace.
 */
import type { SessionRow, WorkspaceOption } from '../components/SessionsColumn.js';
import type { SessionSemanticOption } from '../session-semantics.js';

export interface WorkspaceApiRow {
  id: string;
  name: string;
  root_path: string;
}

export function workspaceOptionsFromRows(workspaces: readonly WorkspaceApiRow[]): WorkspaceOption[] {
  return workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    rootPath: workspace.root_path,
  }));
}

export function filterRowsForWorkspace(
  rows: readonly SessionRow[],
  workspaceId: string,
): SessionRow[] {
  if (workspaceId === '__all') return [...rows];
  return rows.filter((row) => row.workspace === workspaceId || row.workspace === undefined);
}

export function activeWorkspaceIdForRows(
  rows: readonly SessionRow[],
  activeId: string,
  selectedWorkspaceId: string,
): string | undefined {
  return (
    rows.find((session) => session.id === activeId)?.workspace ??
    (selectedWorkspaceId === '__all' ? undefined : selectedWorkspaceId)
  );
}

export function semanticsCatalogScope(workspaceId?: string): { workspace_id?: string } {
  return workspaceId && workspaceId !== '__all' ? { workspace_id: workspaceId } : {};
}

export function semanticOptionsFromResult(
  result:
    | PromiseSettledResult<{
        blueprints: Array<{ id: string; name?: string; description?: string }>;
      }>
    | PromiseSettledResult<{ packs: Array<{ id: string; name?: string; description?: string }> }>,
  key: 'blueprints' | 'packs',
): SessionSemanticOption[] {
  if (result.status !== 'fulfilled') return [];
  const value = result.value as {
    blueprints?: Array<{ id: string; name?: string; description?: string }>;
    packs?: Array<{ id: string; name?: string; description?: string }>;
  };
  return (value[key] ?? []).map((item) => ({
    id: item.id,
    label: item.name ?? item.id,
    ...(item.description ? { description: item.description } : {}),
  }));
}
