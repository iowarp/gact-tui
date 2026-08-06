/**
 * Pure tree-building + drill-down navigation logic for the workspace files
 * view (FilesLayer.tsx). Split out so the navigation semantics — descend
 * into a directory, go back up, breadcrumb the current path, search across
 * the whole tree — are unit-testable without mounting the component or a
 * live backend (owner defect A3: "you cannot descend into folders or go
 * back up").
 *
 * The backend's `/v1/workspaces/{wid}/files` route only ever returns a
 * FLAT recursive listing (SPEC §6.9 — see
 * `clio-agent routes/workspaces.py::list_workspace_files`), never a
 * per-directory listing. Building a tree client-side from that flat list is
 * the documented, sanctioned fallback (never fabricate entries — every node
 * here traces back to a real listed path); `findDirNode` then lets the UI
 * navigate that tree as if it were paginated per-directory.
 */

export interface FileRow {
  path: string;
  size?: number;
  language?: string;
  mime?: string;
  type?: string;
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  language?: string;
  mime?: string;
  children: TreeNode[];
}

/**
 * clio's live wire types directories `"dir"` (probed directly against
 * 127.0.0.1:17900's `/v1/workspaces/{id}/files`), not `"directory"` —
 * SessionView.tsx's own `@`-picker filter already excludes both spellings.
 */
export function isDirectoryType(type: string | undefined): boolean {
  return type === 'dir' || type === 'directory';
}

/** Group the backend's flat file listing into a folder tree. */
export function buildFileTree(files: FileRow[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', type: 'directory', children: [] };
  for (const file of files) {
    const parts = file.path.split(/[\\/]/).filter(Boolean);
    if (parts.length === 0) continue;
    let node = root;
    parts.forEach((part, index) => {
      const isLeaf = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join('/');
      const isFileLeaf = isLeaf && !isDirectoryType(file.type);
      let child = node.children.find((candidate) => candidate.name === part);
      if (!child) {
        child = {
          name: part,
          path,
          type: isFileLeaf ? 'file' : 'directory',
          children: [],
        };
        node.children.push(child);
      }
      if (isFileLeaf) {
        child.size = file.size;
        child.language = file.language;
        child.mime = file.mime;
      }
      node = child;
    });
  }
  const sortTree = (nodes: TreeNode[]): void => {
    nodes.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1,
    );
    nodes.forEach((node) => sortTree(node.children));
  };
  sortTree(root.children);
  return root.children;
}

/**
 * The directory node at `path` ('' = the tree root). Returns `null` when
 * `path` does not resolve to a directory in `tree` — e.g. the current
 * directory was removed by a fresh listing; callers should fall back to
 * root rather than render a dead end.
 */
export function findDirNode(tree: TreeNode[], path: string): TreeNode | null {
  if (!path) return { name: '', path: '', type: 'directory', children: tree };
  const parts = path.split('/').filter(Boolean);
  let nodes = tree;
  let found: TreeNode | null = null;
  for (const part of parts) {
    found = nodes.find((node) => node.name === part && node.type === 'directory') ?? null;
    if (!found) return null;
    nodes = found.children;
  }
  return found;
}

/** The `path`'s parent directory path (`''` for a root-level entry). */
export function parentPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

/** One clickable breadcrumb segment: `label` to show, `path` to navigate to. */
export interface BreadcrumbSegment {
  label: string;
  path: string;
}

/** Breadcrumb segments for `path`, root-first. Empty for the root itself. */
export function breadcrumbSegments(path: string): BreadcrumbSegment[] {
  if (!path) return [];
  const parts = path.split('/').filter(Boolean);
  let acc = '';
  return parts.map((part) => {
    acc = acc ? `${acc}/${part}` : part;
    return { label: part, path: acc };
  });
}

/** One flat search hit: the real node plus its identity, for a path-qualified row. */
export interface FlatMatch {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  language?: string;
  mime?: string;
}

/**
 * Every node anywhere in `tree` whose name contains `query` (case-insensitive),
 * flattened with its full path — used while filtering so a match is never
 * hidden by not having drilled into its parent directory first.
 */
export function searchTree(tree: TreeNode[], query: string): FlatMatch[] {
  const q = query.toLowerCase();
  const out: FlatMatch[] = [];
  const walk = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      if (node.name.toLowerCase().includes(q)) {
        out.push({
          path: node.path,
          name: node.name,
          type: node.type,
          ...(node.size !== undefined ? { size: node.size } : {}),
          ...(node.language ? { language: node.language } : {}),
          ...(node.mime ? { mime: node.mime } : {}),
        });
      }
      if (node.type === 'directory') walk(node.children);
    }
  };
  walk(tree);
  return out;
}
