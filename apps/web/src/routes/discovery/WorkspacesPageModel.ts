/**
 * View-model / pure logic for Workspaces Page: state shaping and helpers, no DOM. Key export `filterWorkspaces`.
 */
import type { CreateWorkspaceInput, Workspace } from '@clio/core';

export function filterWorkspaces(workspaces: Workspace[], query: string): Workspace[] {
  const q = query.trim().toLowerCase();
  if (!q) return workspaces;
  return workspaces.filter(
    (w) =>
      w.id.toLowerCase().includes(q) ||
      w.name.toLowerCase().includes(q) ||
      w.root_path.toLowerCase().includes(q),
  );
}

export function buildCreateWorkspaceInput(
  rootPath: string,
  name: string,
): CreateWorkspaceInput | null {
  const trimmedRoot = rootPath.trim();
  if (!trimmedRoot) return null;
  const trimmedName = name.trim();
  return {
    root_path: trimmedRoot,
    ...(trimmedName ? { name: trimmedName } : {}),
  };
}

export function createdWorkspaceToastBody(workspace: Pick<Workspace, 'id' | 'name'>): string {
  return workspace.name ?? workspace.id;
}

export function unregisterWorkspacePrompt(workspaceName: string): string {
  return `Unregister workspace "${workspaceName}"? Backend keeps on-disk files; only metadata is dropped.`;
}
