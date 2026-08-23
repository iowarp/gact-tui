import type { Workspace } from '@clio/core/v3';

function parentName(path: string): string | undefined {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.length > 1 ? parts.at(-2) : undefined;
}

export function workspaceLabels(workspaces: readonly Workspace[]): Map<string, string> {
  const grouped = new Map<string, Workspace[]>();
  for (const workspace of workspaces) {
    const current = grouped.get(workspace.display_name) ?? [];
    current.push(workspace);
    grouped.set(workspace.display_name, current);
  }

  const labels = new Map<string, string>();
  for (const [name, group] of grouped) {
    if (group.length === 1) {
      const workspace = group[0];
      if (workspace) labels.set(workspace.id, name);
      continue;
    }
    const parentCounts = new Map<string, number>();
    for (const workspace of group) {
      const parent = parentName(workspace.path) ?? workspace.connection_id;
      parentCounts.set(parent, (parentCounts.get(parent) ?? 0) + 1);
    }
    for (const workspace of group) {
      const parent = parentName(workspace.path) ?? workspace.connection_id;
      const suffix =
        (parentCounts.get(parent) ?? 0) > 1 ? `${parent} — ${workspace.connection_id}` : parent;
      labels.set(workspace.id, `${name} — ${suffix}`);
    }
  }
  return labels;
}
