import { useEffect, useMemo, useState } from 'react';
import type { Client } from '@clio/core';
import { Icon, Layer, Skeleton, Splitter } from '../kit';
import {
  breadcrumbSegments,
  buildFileTree,
  findDirNode,
  parentPath,
  searchTree,
  type FileRow,
  type FlatMatch,
  type TreeNode,
} from './fileTree';
import { decodeWorkspaceFilePreview, type FilePreview } from './filePreview';
import { humanSize } from '../wire/presentationUtils';
import './owner-surfaces.css';

export interface FilesLayerProps {
  client: Client;
  open: boolean;
  workspaceId?: string;
  workspaceLabel?: string;
  /** Insert a reference to `path` into the composer draft and close the layer. */
  onAttach: (path: string) => void;
  onClose: () => void;
}

/** {@link humanSize}, tolerating this surface's own `undefined` convention
 *  (round-10 gate finding D8: this file used to carry a second, independently
 *  computed KB formatter — same 1024 math as `humanSize` but capped at KB
 *  with no MB/GB tier — now unified on the one shared formatter). */
export function readableSize(value: number | undefined): string {
  return humanSize(value);
}

const TREE_WIDTH_DEFAULT = 210;
const TREE_WIDTH_MIN = 160;
const TREE_WIDTH_MAX = 420;

type PreviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | FilePreview;

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
 *
 * Navigation is drill-down (owner defect A3): the backend's file-list route
 * only ever returns one flat recursive listing (no per-directory endpoint —
 * see fileTree.ts's own doc comment), so a tree is built from it client-side
 * once, then the pane shows exactly ONE directory's children at a time plus
 * a breadcrumb back to root — "descend"/"go back up" are real navigation
 * states, not an always-expanded accordion.
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
  const [currentDir, setCurrentDir] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ kind: 'idle' });
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [treeWidth, setTreeWidth] = useState(TREE_WIDTH_DEFAULT);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setPreview({ kind: 'idle' });
    setFilter('');
    setCurrentDir('');
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
  // The listing that produced `currentDir` may have changed (a fresh open
  // re-fetches); fall back to root rather than render a dead directory.
  const currentNode = useMemo(() => findDirNode(tree, currentDir) ?? findDirNode(tree, ''), [tree, currentDir]);
  const crumbs = useMemo(() => breadcrumbSegments(currentDir), [currentDir]);
  const query = filter.trim().toLowerCase();
  const searchResults = useMemo(() => (query ? searchTree(tree, query) : null), [tree, query]);

  async function openFile(path: string): Promise<void> {
    if (!workspaceId) return;
    setSelected(path);
    setPreview({ kind: 'loading' });
    try {
      const result = await client.readWorkspaceFile(workspaceId, path);
      setPreview(decodeWorkspaceFilePreview(result, path));
    } catch (reason) {
      setPreview({
        kind: 'error',
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }

  function enterDirectory(path: string): void {
    setCurrentDir(path);
    setFilter('');
  }

  function openMatch(match: FlatMatch): void {
    if (match.type === 'directory') {
      enterDirectory(match.path);
    } else {
      void openFile(match.path);
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
      // The prototype's Files layer uses the SAME LayerChrome.dc.html partial
      // as observability (kind="files"), so it carries the same Expand/Pop
      // out/Close-as-SVG-X chrome — not just the eye window.
      windowControls
      width={680}
      height={height}
      onClose={onClose}
    >
      <div className="files-layer__body">
        <div className="files-layer__tree" style={{ width: `${treeWidth}px` }}>
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
          {state === 'loading' ? (
            <div className="files-layer__empty">
              <Skeleton label="Loading workspace files…" />
            </div>
          ) : null}
          {state === 'failed' ? <p className="files-layer__error">Could not load workspace files.</p> : null}
          {state === 'ready' && tree.length === 0 && workspaceId ? (
            <p className="files-layer__empty">This workspace has no files yet.</p>
          ) : null}

          {state === 'ready' && tree.length > 0 && !searchResults ? (
            <nav className="files-layer__crumbs" aria-label="Current directory">
              <button type="button" onClick={() => enterDirectory('')} disabled={!currentDir}>
                root
              </button>
              {crumbs.map((crumb, index) => (
                <span key={crumb.path}>
                  <span aria-hidden="true"> / </span>
                  <button
                    type="button"
                    onClick={() => enterDirectory(crumb.path)}
                    disabled={index === crumbs.length - 1}
                  >
                    {crumb.label}
                  </button>
                </span>
              ))}
            </nav>
          ) : null}

          <div className="session-files__list">
            {searchResults ? (
              <SearchResultRows results={searchResults} selected={selected} onOpen={openMatch} />
            ) : (
              <>
                {currentDir ? (
                  <button
                    type="button"
                    className="files-layer__up"
                    onClick={() => enterDirectory(parentPath(currentDir))}
                  >
                    <span className="files-layer__chev" aria-hidden="true">
                      ‹
                    </span>
                    <Icon name="folder" />
                    <span>
                      <strong>..</strong>
                    </span>
                  </button>
                ) : null}
                {searchResults === null && currentNode
                  ? currentNode.children.map((node) => (
                      <DirRow
                        key={node.path}
                        node={node}
                        selected={selected}
                        onOpen={() =>
                          node.type === 'directory' ? enterDirectory(node.path) : void openFile(node.path)
                        }
                      />
                    ))
                  : null}
                {currentNode && currentNode.children.length === 0 ? (
                  <p className="files-layer__empty">This directory is empty.</p>
                ) : null}
              </>
            )}
          </div>
        </div>

        <Splitter
          label="Files tree width"
          value={treeWidth}
          min={TREE_WIDTH_MIN}
          max={TREE_WIDTH_MAX}
          onResize={setTreeWidth}
          onReset={() => setTreeWidth(TREE_WIDTH_DEFAULT)}
        />

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
              <PreviewBody preview={preview} />
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

export function DirRow({
  node,
  selected,
  onOpen,
}: {
  node: TreeNode;
  selected: string | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      data-active={selected === node.path ? 'true' : undefined}
      onClick={onOpen}
    >
      {node.type === 'directory' ? (
        <span className="files-layer__chev" aria-hidden="true">
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
  );
}

export function SearchResultRows({
  results,
  selected,
  onOpen,
}: {
  results: FlatMatch[];
  selected: string | null;
  onOpen: (match: FlatMatch) => void;
}) {
  if (results.length === 0) {
    return <p className="files-layer__empty">No files match.</p>;
  }
  return (
    <>
      {results.map((match) => (
        <button
          key={match.path}
          type="button"
          data-active={selected === match.path ? 'true' : undefined}
          onClick={() => onOpen(match)}
        >
          {match.type === 'directory' ? (
            <span className="files-layer__chev" aria-hidden="true">
              ›
            </span>
          ) : (
            <span className="files-layer__chev" aria-hidden="true" />
          )}
          <Icon name={match.type === 'directory' ? 'folder' : 'doc'} />
          <span>
            <strong>{match.name}</strong>
            <small>{match.path}</small>
          </span>
          <small>{match.type === 'file' ? readableSize(match.size) : ''}</small>
        </button>
      ))}
    </>
  );
}

const CSV_SHOWN_ROWS = 50;

/** Renders the selected file's content per its decoded preview kind — raw
 * text stays raw (never a JSON parse), CSV becomes a bounded table, binary
 * files get an honest byte-count notice instead of corrupted/garbled text. */
function PreviewBody({ preview }: { preview: PreviewState }) {
  if (preview.kind === 'idle') return null;
  if (preview.kind === 'loading') {
    return (
      <div className="files-layer__empty">
        <Skeleton label="Loading file…" />
      </div>
    );
  }
  if (preview.kind === 'error') {
    return <p className="files-layer__error">Could not read file: {preview.message}</p>;
  }
  if (preview.kind === 'image') {
    return (
      <div className="files-layer__imagewrap">
        <img className="files-layer__image" src={preview.dataUrl} alt="" />
      </div>
    );
  }
  if (preview.kind === 'binary') {
    return (
      <p className="files-layer__empty" data-testid="files-layer-binary-notice">
        binary file ({preview.size.toLocaleString()} bytes, {preview.mediaType}) — no text preview
      </p>
    );
  }
  if (preview.kind === 'csv') {
    return (
      <div className="files-layer__csvwrap">
        <table className="files-layer__csv">
          <thead>
            <tr>
              {preview.header.map((cell, i) => (
                <th key={i}>{cell}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.slice(0, CSV_SHOWN_ROWS).map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="files-layer__csvfoot">
          first {Math.min(CSV_SHOWN_ROWS, preview.rows.length)} of {preview.totalRows.toLocaleString()} rows
        </p>
      </div>
    );
  }
  return (
    <pre className="files-layer__content">
      <code>{preview.text}</code>
    </pre>
  );
}
