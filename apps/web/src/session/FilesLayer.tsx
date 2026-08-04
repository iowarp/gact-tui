import { useEffect, useMemo, useState } from 'react';
import type { Client } from '@clio/core';
import { Icon, Layer } from '../kit';
import './owner-surfaces.css';

interface FileRow {
  path: string;
  size?: number;
  language?: string;
  mime?: string;
  type?: string;
}

export interface FilesLayerProps {
  client: Client;
  open: boolean;
  workspaceId?: string;
  workspaceLabel?: string;
  /** Insert a reference to `path` into the composer draft and close the layer. */
  onAttach: (path: string) => void;
  onClose: () => void;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  language?: string;
  mime?: string;
  children: TreeNode[];
}

function readableSize(value: number | undefined): string {
  if (value === undefined) return '';
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(value < 10_240 ? 1 : 0)} KB`;
}

/**
 * Group the backend's flat file listing into a folder tree — the prototype's
 * `fsTree` renders chevron/folder rows with real nesting, which a flat button
 * list (the previous right-panel implementation) never built.
 */
function buildFileTree(files: FileRow[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', type: 'directory', children: [] };
  for (const file of files) {
    const parts = file.path.split(/[\\/]/).filter(Boolean);
    if (parts.length === 0) continue;
    let node = root;
    parts.forEach((part, index) => {
      const isLeaf = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join('/');
      let child = node.children.find((candidate) => candidate.name === part);
      if (!child) {
        child = {
          name: part,
          path,
          type: isLeaf && file.type !== 'directory' ? 'file' : 'directory',
          children: [],
        };
        node.children.push(child);
      }
      if (isLeaf && file.type !== 'directory') {
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

/** Every folder path on the route to any node whose name matches `query`. */
function foldersMatching(nodes: TreeNode[], query: string, ancestors: string[] = []): Set<string> {
  const hits = new Set<string>();
  for (const node of nodes) {
    const selfMatch = node.name.toLowerCase().includes(query);
    const childHits = foldersMatching(node.children, query, [...ancestors, node.path]);
    if (selfMatch || childHits.size > 0) {
      for (const ancestor of ancestors) hits.add(ancestor);
      if (node.type === 'directory' && (selfMatch || childHits.size > 0)) hits.add(node.path);
    }
    for (const hit of childHits) hits.add(hit);
  }
  return hits;
}

function nodeMatches(node: TreeNode, query: string): boolean {
  if (node.name.toLowerCase().includes(query)) return true;
  return node.children.some((child) => nodeMatches(child, query));
}

/**
 * The files layer — the prototype's `layerFiles` MODAL (LayerChrome, ~680px x
 * 72vh, 8vh top margin), not side-pane content.
 *
 * kit/Layer.tsx already documents this: "Settings, observability and files
 * are OVERLAYS in the prototype, not side-pane content" (#331). An
 * owner-review round nonetheless routed files/artifacts/context into the
 * right-hand detail slot (docs/p5/conformance/panels.json) — this restores
 * files to the measured prototype grammar; artifacts/ctx now deep-link into
 * the Observability layer instead (see SessionView's onTogglePanel).
 */
export function FilesLayer({
  client,
  open,
  workspaceId,
  workspaceLabel,
  onAttach,
  onClose,
}: FilesLayerProps) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  // Root-level folders start open (matches the prototype's small demo tree);
  // deeper ones start closed so a real, much larger workspace stays readable.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setContent('');
    setFilter('');
    if (!workspaceId) {
      setFiles([]);
      setState('ready');
      return;
    }
    let cancelled = false;
    setState('loading');
    void client.workspaceFiles(workspaceId, { limit: 500 }).then(
      (result) => {
        if (cancelled) return;
        setFiles(result.files);
        setExpanded(new Set(buildFileTree(result.files).filter((n) => n.type === 'directory').map((n) => n.path)));
        setState('ready');
      },
      () => {
        if (!cancelled) setState('failed');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, workspaceId, open]);

  const tree = useMemo(() => buildFileTree(files), [files]);
  const query = filter.trim().toLowerCase();
  // While filtering, every ancestor of a match is force-open regardless of
  // the user's own collapse state, so results are never hidden by a closed
  // folder — restored once the filter is cleared.
  const filterExpanded = useMemo(
    () => (query ? foldersMatching(tree, query) : null),
    [tree, query],
  );

  function toggleFolder(path: string): void {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function openFile(node: TreeNode): Promise<void> {
    if (!workspaceId || node.type === 'directory') return;
    setSelected(node.path);
    setContent('Loading file…');
    try {
      const result = await client.workspaceReadFile(workspaceId, node.path);
      setContent(result.content);
    } catch (reason) {
      setContent(`Could not read file: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  }

  // The prototype's winH is 72% of the viewport height with an 8vh top
  // margin (Layer's own `window` sizing already applies that margin+cap).
  const height = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.72) : 620;

  return (
    <Layer
      open={open}
      title="files"
      headerIcon={<Icon name="folder" size={14} />}
      headerMeta={workspaceLabel ?? workspaceId ?? 'no workspace'}
      headerActions={
        // The prototype's fsBrowse just steps up one directory inside its own
        // mocked tree; our real listing is scoped to the registered workspace
        // root with no filesystem traversal above it, so honestly degrade
        // rather than pretend — same convention as the +new dialog's browse
        // button (owner-review-1).
        <button
          type="button"
          className="files-layer__browse"
          data-unbacked="true"
          disabled
          title="Browsing outside the workspace root is not wired — no filesystem endpoint above it."
        >
          browse…
        </button>
      }
      width={680}
      height={height}
      onClose={onClose}
    >
      <div className="files-layer__body">
        <div className="files-layer__tree">
          <label className="session-files__filter">
            <Icon name="search" />
            <input
              aria-label="Filter workspace files"
              placeholder="filter files"
              value={filter}
              onChange={(event) => setFilter(event.currentTarget.value)}
            />
          </label>
          {!workspaceId ? (
            <p className="files-layer__empty">No workspace is attached to this session.</p>
          ) : null}
          {state === 'loading' ? <p className="files-layer__empty">Loading workspace files…</p> : null}
          {state === 'failed' ? <p className="files-layer__error">Could not load workspace files.</p> : null}
          {state === 'ready' && tree.length === 0 && workspaceId ? (
            <p className="files-layer__empty">This workspace has no files yet.</p>
          ) : null}
          <div className="session-files__list">
            <TreeRows
              nodes={tree}
              depth={0}
              query={query}
              expanded={expanded}
              filterExpanded={filterExpanded}
              selected={selected}
              onToggleFolder={toggleFolder}
              onOpenFile={(node) => void openFile(node)}
            />
          </div>
        </div>

        <div className="files-layer__preview">
          {selected ? (
            <>
              <header className="files-layer__previewhead">
                <strong>{selected}</strong>
                <span className="files-layer__spacer" />
                <button
                  type="button"
                  className="files-layer__attach"
                  onClick={() => onAttach(selected)}
                >
                  attach to message
                </button>
              </header>
              <pre className="files-layer__content">
                <code>{content}</code>
              </pre>
              <footer className="files-layer__previewfoot">
                <button
                  type="button"
                  className="files-layer__save"
                  data-unbacked="true"
                  disabled
                  title="Editing is not wired — no workspace file-write endpoint."
                >
                  save
                </button>
              </footer>
            </>
          ) : (
            <p className="files-layer__empty">Select a file to preview it.</p>
          )}
        </div>
      </div>
    </Layer>
  );
}

interface TreeRowsProps {
  nodes: TreeNode[];
  depth: number;
  query: string;
  expanded: Set<string>;
  /** Non-null while filtering: the set of folder paths forced open to reveal
   *  matches, overriding the user's own collapse state. */
  filterExpanded: Set<string> | null;
  selected: string | null;
  onToggleFolder: (path: string) => void;
  onOpenFile: (node: TreeNode) => void;
}

function TreeRows({
  nodes,
  depth,
  query,
  expanded,
  filterExpanded,
  selected,
  onToggleFolder,
  onOpenFile,
}: TreeRowsProps) {
  const visible = query ? nodes.filter((node) => nodeMatches(node, query)) : nodes;
  return (
    <>
      {visible.map((node) => {
        const isOpen = node.type === 'directory' && (filterExpanded?.has(node.path) ?? expanded.has(node.path));
        return (
          <div key={node.path}>
            <button
              type="button"
              data-active={selected === node.path ? 'true' : undefined}
              style={{ paddingLeft: `${8 + depth * 14}px` }}
              onClick={() =>
                node.type === 'directory' ? onToggleFolder(node.path) : onOpenFile(node)
              }
            >
              {node.type === 'directory' ? (
                <span className="files-layer__chev" data-open={isOpen ? 'true' : undefined} aria-hidden="true">
                  ›
                </span>
              ) : (
                <span className="files-layer__chev" aria-hidden="true" />
              )}
              <Icon name={node.type === 'directory' ? 'folder' : 'doc'} />
              <span>
                <strong>{node.name}</strong>
                {node.type === 'file' ? <small>{node.language || node.mime || 'file'}</small> : null}
              </span>
              <small>{node.type === 'file' ? readableSize(node.size) : ''}</small>
            </button>
            {node.type === 'directory' && isOpen ? (
              <TreeRows
                nodes={node.children}
                depth={depth + 1}
                query={query}
                expanded={expanded}
                filterExpanded={filterExpanded}
                selected={selected}
                onToggleFolder={onToggleFolder}
                onOpenFile={onOpenFile}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}
