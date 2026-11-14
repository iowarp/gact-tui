import { t } from '@lingui/core/macro';
import type { Workspace } from '@clio/core/v3';

/** Conversations started outside a project folder live in the default workspace. */
export const DEFAULT_WORKSPACE_ID = 'ws_default';

// i18n-ignore: a search term, not copy; the shown name is translated below.
const DEFAULT_WORKSPACE_SEARCH_TERM = 'Conversations';

type NamedWorkspace = { id: string; display_name?: string; name?: string };

/** The default workspace is shown as "Conversations" wherever a workspace is named. */
export function workspaceName(workspace: NamedWorkspace): string {
  if (workspace.id === DEFAULT_WORKSPACE_ID) return t`Conversations`;
  return workspace.display_name || workspace.name || workspace.id;
}

/**
 * The text a search matches for a workspace: its shown name, plus the default
 * workspace's English name so typing "conversations" still finds it in any locale.
 */
export function workspaceSearchName(workspace: NamedWorkspace): string {
  const name = workspaceName(workspace);
  return workspace.id === DEFAULT_WORKSPACE_ID && name !== DEFAULT_WORKSPACE_SEARCH_TERM
    ? `${name} ${DEFAULT_WORKSPACE_SEARCH_TERM}`
    : name;
}

function parentName(path: string): string | undefined {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.length > 1 ? parts.at(-2) : undefined;
}

export interface WorkspaceDisplayLabel {
  name: string;
  qualifiers: readonly string[];
}

export function workspaceLabelText(label: WorkspaceDisplayLabel): string {
  return [label.name, ...label.qualifiers].join(' ');
}

export function workspaceLabels(
  workspaces: readonly Workspace[],
): Map<string, WorkspaceDisplayLabel> {
  const grouped = new Map<string, Workspace[]>();
  for (const workspace of workspaces) {
    const current = grouped.get(workspace.display_name) ?? [];
    current.push(workspace);
    grouped.set(workspace.display_name, current);
  }

  const labels = new Map<string, WorkspaceDisplayLabel>();
  for (const [name, group] of grouped) {
    if (group.length === 1) {
      const workspace = group[0];
      if (workspace) labels.set(workspace.id, { name, qualifiers: [] });
      continue;
    }
    const parentCounts = new Map<string, number>();
    for (const workspace of group) {
      const parent = parentName(workspace.path) ?? workspace.connection_id;
      parentCounts.set(parent, (parentCounts.get(parent) ?? 0) + 1);
    }
    for (const workspace of group) {
      const parent = parentName(workspace.path) ?? workspace.connection_id;
      const qualifiers =
        (parentCounts.get(parent) ?? 0) > 1 ? [parent, workspace.connection_id] : [parent];
      labels.set(workspace.id, { name, qualifiers });
    }
  }
  return labels;
}
