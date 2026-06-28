/**
 * View-model / pure logic for Preview Rail Tree: state shaping and helpers, no DOM. Key export `TreeNode`.
 */
import type { WorkspaceFileEntry } from '@clio/core';

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
  children: TreeNode[];
}

export function splitPath(path: string): string[] {
  return path.split(/[\\/]+/).filter((part) => part.length > 0);
}

export function normalizePath(path: string): string {
  return splitPath(path).join('/');
}

export function buildTree(entries: WorkspaceFileEntry[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', type: 'dir', children: [] };
  const dirIndex = new Map<string, TreeNode>();
  dirIndex.set('', root);

  function ensureDir(parts: string[]): TreeNode {
    let cur = root;
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      let next = dirIndex.get(acc);
      if (!next) {
        next = { name: part, path: acc, type: 'dir', children: [] };
        dirIndex.set(acc, next);
        cur.children.push(next);
      }
      cur = next;
    }
    return cur;
  }

  for (const entry of entries) {
    const parts = splitPath(entry.path);
    if (parts.length === 0) continue;
    const name = parts[parts.length - 1]!;
    const parent = ensureDir(parts.slice(0, -1));
    const full = parts.join('/');
    if (entry.type === 'dir') {
      if (!dirIndex.has(full)) {
        const node: TreeNode = { name, path: full, type: 'dir', children: [] };
        dirIndex.set(full, node);
        parent.children.push(node);
      }
    } else if (!parent.children.some((child) => child.path === full && child.type === 'file')) {
      parent.children.push({
        name,
        path: full,
        type: 'file',
        size: entry.size,
        children: [],
      });
    }
  }

  sortTree(root);
  return root.children;
}

function sortTree(node: TreeNode): void {
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) if (child.type === 'dir') sortTree(child);
}

export function flattenVisible(
  nodes: TreeNode[],
  expanded: Set<string>,
  filter: string,
): Array<{ node: TreeNode; depth: number }> {
  const query = filter.trim().toLowerCase();
  const out: Array<{ node: TreeNode; depth: number }> = [];

  function matches(node: TreeNode): boolean {
    if (!query) return true;
    if (node.type === 'file') return node.path.toLowerCase().includes(query);
    return node.children.some(matches);
  }

  function walk(list: TreeNode[], depth: number): void {
    for (const node of list) {
      if (!matches(node)) continue;
      out.push({ node, depth });
      if (node.type === 'dir') {
        const open = query ? true : expanded.has(node.path);
        if (open) walk(node.children, depth + 1);
      }
    }
  }

  walk(nodes, 0);
  return out;
}

export function findTreeNode(nodes: TreeNode[], path: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.type === 'dir') {
      const found = findTreeNode(node.children, path);
      if (found) return found;
    }
  }
  return undefined;
}
