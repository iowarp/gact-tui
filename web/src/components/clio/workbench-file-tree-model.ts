import type { WorkspaceFileEntry } from '@clio/core/v3';

export interface WorkspaceFileNode {
  entry: WorkspaceFileEntry;
  name: string;
  children: Map<string, WorkspaceFileNode>;
}

export function buildFileTree(entries: readonly WorkspaceFileEntry[]): WorkspaceFileNode[] {
  const roots = new Map<string, WorkspaceFileNode>();
  for (const entry of entries) {
    const parts = (entry.display_path ?? entry.path).split(/[\\/]+/).filter(Boolean);
    let children = roots;
    parts.forEach((name, index) => {
      const isLeaf = index === parts.length - 1;
      const existing = children.get(name);
      const node = existing ?? {
        entry: {
          path: parts.slice(0, index + 1).join('/'),
          type: isLeaf ? entry.type : 'dir',
          internal: false,
        },
        name,
        children: new Map<string, WorkspaceFileNode>(),
      };
      if (isLeaf) node.entry = entry;
      children.set(name, node);
      children = node.children;
    });
  }
  return sortedNodes(roots);
}

export function sortedNodes(nodes: Map<string, WorkspaceFileNode>): WorkspaceFileNode[] {
  return [...nodes.values()].sort((left, right) => {
    if (left.entry.type !== right.entry.type) return left.entry.type === 'dir' ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}
