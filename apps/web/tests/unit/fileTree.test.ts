/**
 * Pure drill-down navigation logic for the workspace files view (owner
 * defect A3: "you cannot descend into folders or go back up"). The backend
 * only ever returns one flat recursive listing (SPEC §6.9), so these cases
 * pin building a tree from that flat list once and then navigating it —
 * descend into a directory, list exactly its children, go back up via
 * `parentPath`, breadcrumb the current path, and search across the whole
 * tree regardless of the current directory.
 */
import { describe, expect, it } from 'vitest';
import {
  breadcrumbSegments,
  buildFileTree,
  findDirNode,
  isDirectoryType,
  parentPath,
  searchTree,
  type FileRow,
} from '../../src/session/fileTree';

const FILES: FileRow[] = [
  { path: '.clio', type: 'dir' },
  { path: '.clio\\agent', type: 'dir' },
  { path: '.clio\\agent\\artifacts', type: 'dir' },
  { path: '.clio\\agent\\artifacts\\cas', type: 'dir' },
  {
    path: '.clio\\agent\\artifacts\\cas\\20\\200bbe9115.bin',
    type: 'file',
    size: 153082,
  },
  { path: 'earthscope_stations_clean.csv', type: 'file', size: 162790 },
  { path: 'MTA1_LA_ground_motion_report.md', type: 'file', size: 5745 },
];

describe('isDirectoryType', () => {
  it('accepts both the live wire spelling ("dir") and "directory"', () => {
    expect(isDirectoryType('dir')).toBe(true);
    expect(isDirectoryType('directory')).toBe(true);
    expect(isDirectoryType('file')).toBe(false);
    expect(isDirectoryType(undefined)).toBe(false);
  });
});

describe('buildFileTree', () => {
  it('normalizes backslash-separated backend paths into a forward-slash tree, dirs before files', () => {
    const tree = buildFileTree(FILES);
    // Directories first, then files in locale-collated (case-insensitive) order.
    expect(tree.map((n) => n.name)).toEqual(['.clio', 'earthscope_stations_clean.csv', 'MTA1_LA_ground_motion_report.md']);
    const clio = tree[0]!;
    expect(clio.type).toBe('directory');
    expect(clio.path).toBe('.clio');
    const agent = clio.children[0]!;
    expect(agent.path).toBe('.clio/agent');
  });

  it('never fabricates an entry — every tree node traces to a real listed path', () => {
    const tree = buildFileTree(FILES);
    const names = new Set<string>();
    const walk = (nodes: typeof tree): void => {
      for (const n of nodes) {
        names.add(n.path);
        walk(n.children);
      }
    };
    walk(tree);
    // Every intermediate directory implied by a nested file path exists,
    // and nothing beyond what FILES implies was invented.
    expect(names.has('.clio/agent/artifacts/cas/20')).toBe(true);
    expect(names.has('.clio/agent/artifacts/cas/20/200bbe9115.bin')).toBe(true);
    expect(names.has('.clio/nonexistent')).toBe(false);
  });
});

describe('findDirNode — descend', () => {
  const tree = buildFileTree(FILES);

  it('root ("") resolves to the top-level children', () => {
    const root = findDirNode(tree, '');
    expect(root?.children.map((n) => n.name)).toContain('.clio');
  });

  it('descends multiple levels to a real nested directory', () => {
    const cas = findDirNode(tree, '.clio/agent/artifacts/cas');
    expect(cas).not.toBeNull();
    expect(cas?.type).toBe('directory');
    expect(cas?.children.map((n) => n.name)).toEqual(['20']);
  });

  it('returns null for a path that does not resolve to a directory (never a dead-end crash)', () => {
    expect(findDirNode(tree, 'earthscope_stations_clean.csv')).toBeNull();
    expect(findDirNode(tree, 'does/not/exist')).toBeNull();
  });
});

describe('parentPath — go back up', () => {
  it('drops the last segment', () => {
    expect(parentPath('.clio/agent/artifacts/cas')).toBe('.clio/agent/artifacts');
    expect(parentPath('.clio')).toBe('');
  });

  it('is idempotent at the root', () => {
    expect(parentPath('')).toBe('');
  });
});

describe('breadcrumbSegments', () => {
  it('is empty at the root', () => {
    expect(breadcrumbSegments('')).toEqual([]);
  });

  it('carries each segment with its cumulative path, root-first', () => {
    expect(breadcrumbSegments('.clio/agent/artifacts')).toEqual([
      { label: '.clio', path: '.clio' },
      { label: 'agent', path: '.clio/agent' },
      { label: 'artifacts', path: '.clio/agent/artifacts' },
    ]);
  });
});

describe('searchTree', () => {
  it('finds matches anywhere in the tree regardless of current directory, with full paths', () => {
    const tree = buildFileTree(FILES);
    const hits = searchTree(tree, 'clean');
    expect(hits).toEqual([
      { path: 'earthscope_stations_clean.csv', name: 'earthscope_stations_clean.csv', type: 'file', size: 162790 },
    ]);
  });

  it('matches directory names too, deep in the tree', () => {
    const tree = buildFileTree(FILES);
    const hits = searchTree(tree, 'cas');
    expect(hits.some((h) => h.path === '.clio/agent/artifacts/cas' && h.type === 'directory')).toBe(true);
  });

  it('is case-insensitive', () => {
    const tree = buildFileTree(FILES);
    expect(searchTree(tree, 'REPORT').map((h) => h.path)).toEqual(['MTA1_LA_ground_motion_report.md']);
  });
});
