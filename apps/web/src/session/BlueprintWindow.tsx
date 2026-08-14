import { useEffect, useState } from 'react';
import {
  fetchAgentBlueprint,
  type AgentBlueprintDetail,
  type BlueprintFileEntry,
  type Client,
} from '@clio/core';
import { Layer, Skeleton } from '../kit';
import { Markdown } from '../transcript/markdown';
import {
  breadcrumbSegments,
  buildFileTree,
  findDirNode,
  parentPath,
  type FileRow,
} from './fileTree';
import { DirRow } from './FilesLayer';
import { decodeWorkspaceFilePreview, splitFrontmatter, type FilePreview } from './filePreview';
import './owner-surfaces.css';
import './blueprintwindow.css';

export interface BlueprintWindowProps {
  blueprintId: string | null;
  client: Client;
  open: boolean;
  onClose: () => void;
  /**
   * Optional session id to resolve a PATH-activated blueprint (a session
   * whose `active_agent_blueprint_path` names this exact blueprint id) even
   * when the id isn't in the installed/discovery catalog — the demo case
   * (`earthscope-flat`). Neither current call site (SessionView,
   * settings/BlueprintsPage) has one in scope yet; this just lets a future
   * caller (or a test) pass it through to the file-explorer routes.
   */
  sessionId?: string;
}

type BlueprintLoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; detail: AgentBlueprintDetail }
  | { kind: 'failed'; detail: string };

/**
 * The blueprint window — an EXPLORER of the active blueprint's files (owner
 * ask, cluster B), same tree-left/content-right grammar as the fixed
 * FilesLayer, backed by whatever the clio server can actually serve for a
 * blueprint's root directory.
 *
 * Root cause of the prior "shows only the definition, badly formatted"
 * complaint: `GET /v1/agent-blueprints/{id}` (clio-agent
 * routes/blueprints.py:298 `get_agent_blueprint`) already carries the
 * AGENT.md body as `agent_blueprint.metadata.body` (parsed off frontmatter —
 * `agent_blueprints.py:342`), but this component never read it; it rendered
 * a raw `<dl>`/`<pre>` metadata dump instead and stubbed the actual
 * definition text as "no wire surface yet". That stub was stale — this
 * renders the real body through the transcript Markdown module.
 *
 * The formerly-missing piece — a per-directory listing/read surface for the
 * blueprint's root (`experts/*.md`, `tools/`, …) — is now backed by
 * `GET /v1/agent-blueprints/{id}/files[/read]` (clio-agent #1192);
 * `BlueprintFileExplorer` below renders a real tree/content pane off it.
 * The workspace file routes (`GET /v1/workspaces/{wid}/files[/read]`) don't
 * apply here — they're scoped to a REGISTERED workspace id, not an
 * arbitrary filesystem path, and a blueprint's `root` is neither. An older
 * clio host that doesn't yet expose the new routes gets an honest, typed
 * gap notice instead of a faked tree (see `BlueprintExplorerGap` below).
 */
export function BlueprintWindow({
  blueprintId,
  client,
  open,
  onClose,
  sessionId,
}: BlueprintWindowProps) {
  const [state, setState] = useState<BlueprintLoadState>({ kind: 'idle' });

  useEffect(() => {
    if (!open || !blueprintId) {
      setState({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    void fetchAgentBlueprint(client, blueprintId).then(
      (detail) => {
        if (!cancelled) setState({ kind: 'loaded', detail });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'failed',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [blueprintId, client, open]);

  const blueprint = state.kind === 'loaded' ? state.detail.agent_blueprint : null;
  const title = blueprint?.title || blueprintId || 'blueprint';
  // Clickable even with nothing attached (fresh-session.json C1) — the
  // prototype's own click routes a bare session to a blueprint PICKER
  // (Settings > blueprints, not built yet — tracked separately). Until that
  // exists, opening this window and saying so honestly is the correct
  // degraded behavior: something real happens, nothing is fabricated.
  const layerOpen = open && state.kind !== 'loading';

  return (
    // The prototype's blueprint window uses the same LayerChrome.dc.html
    // partial as observability/files (kind="bp") — same Expand/Pop out/
    // Close-as-SVG-X chrome.
    <Layer open={layerOpen} title={title} windowControls width={680} height={560} onClose={onClose}>
      {!blueprintId ? (
        <p className="blueprintwindow__empty" data-testid="blueprint-window-empty">
          No blueprint is attached to this session. Picking one from here is not wired yet.
        </p>
      ) : null}
      {state.kind === 'failed' ? (
        <p className="blueprintwindow__empty" role="alert">
          Could not load blueprint: {state.detail}
        </p>
      ) : null}
      {state.kind === 'loaded' ? (
        <BlueprintDetail detail={state.detail} client={client} sessionId={sessionId} />
      ) : null}
    </Layer>
  );
}

function BlueprintDetail({
  detail,
  client,
  sessionId,
}: {
  detail: AgentBlueprintDetail;
  client: Client;
  sessionId?: string;
}) {
  const { agent_blueprint: blueprint } = detail;
  const agents = detail.agents ?? [];
  const rawBody = blueprint.metadata?.['body'];
  const body = typeof rawBody === 'string' ? rawBody.trim() : '';
  const rootDir = blueprint.root ?? '';

  return (
    <div className="blueprintwindow">
      <dl className="blueprintwindow__identity">
        <div>
          <dt>version</dt>
          <dd>{blueprint.version || 'not provided'}</dd>
        </div>
        <div>
          <dt>root</dt>
          <dd className="blueprintwindow__path" title={rootDir}>
            {rootDir || 'not provided'}
          </dd>
        </div>
      </dl>
      {blueprint.description ? <p className="blueprintwindow__desc">{blueprint.description}</p> : null}

      <section aria-labelledby="blueprint-definition-title" className="blueprintwindow__section">
        <h3 id="blueprint-definition-title">definition</h3>
        {body ? (
          <div className="blueprintwindow__markdown" data-testid="blueprint-window-markdown">
            <Markdown text={body} />
          </div>
        ) : (
          <p className="blueprintwindow__empty">
            This blueprint's AGENT.md has no body text beyond its frontmatter.
          </p>
        )}
      </section>

      <BlueprintFileExplorer client={client} blueprintId={blueprint.id} sessionId={sessionId} />

      <section aria-labelledby="blueprint-agents-title" className="blueprintwindow__section">
        <h3 id="blueprint-agents-title">served agents</h3>
        {agents.length > 0 ? (
          <ul>
            {agents.map((agent) => (
              <li key={agent.id}>{agent.title || agent.id}</li>
            ))}
          </ul>
        ) : (
          <p>none</p>
        )}
      </section>

      <JsonSection title="mcp_descriptors" value={detail.mcp_descriptors ?? []} />
      <JsonSection title="defaults" value={blueprint.defaults ?? {}} />

      <section aria-labelledby="blueprint-validation-title" className="blueprintwindow__section">
        <h3 id="blueprint-validation-title">validation_errors</h3>
        {(blueprint.validation_errors ?? []).length > 0 ? (
          <ul>
            {blueprint.validation_errors?.map((error) => <li key={error}>{error}</li>)}
          </ul>
        ) : (
          <p>none</p>
        )}
      </section>
    </div>
  );
}

type ExplorerListState =
  | { kind: 'loading' }
  | { kind: 'ready'; entries: BlueprintFileEntry[] }
  | { kind: 'gap' }
  | { kind: 'error'; message: string };

type ExplorerPreviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | FilePreview;

/**
 * A 404 off `listBlueprintFiles`/`readBlueprintFile` means "this clio host
 * predates #1192's routes" — the honest-degrade case that falls back to
 * `BlueprintExplorerGap`. Any OTHER failure (network error, 500, …) is a
 * real bug and must not be conflated with that version-mismatch story.
 * Duck-typed rather than `instanceof HttpError` so a test can hand back any
 * 404-shaped rejection without constructing the real error class.
 */
function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: unknown }).status === 404
  );
}

function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

/**
 * The blueprint's file explorer — tree-left/content-right over
 * `GET /v1/agent-blueprints/{id}/files[/read]` (clio-agent #1192), same
 * drill-down grammar as `FilesLayer` (reuses `buildFileTree`/`findDirNode`/
 * `breadcrumbSegments`/`DirRow` verbatim rather than re-implementing the row
 * markup). Falls back to the honest `BlueprintExplorerGap` notice when the
 * backend doesn't have the route yet (404), and to a distinct error message
 * for any other failure so a real bug is never misattributed as a version
 * mismatch.
 */
function BlueprintFileExplorer({
  client,
  blueprintId,
  sessionId,
}: {
  client: Client;
  blueprintId: string;
  sessionId?: string;
}) {
  const [listState, setListState] = useState<ExplorerListState>({ kind: 'loading' });
  const [currentDir, setCurrentDir] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExplorerPreviewState>({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    setListState({ kind: 'loading' });
    setCurrentDir('');
    setSelectedPath(null);
    setPreview({ kind: 'idle' });
    void client.listBlueprintFiles(blueprintId, { sessionId }).then(
      (result) => {
        if (cancelled) return;
        setListState({ kind: 'ready', entries: result.entries });
        // The definition view (AGENT.md) stays the default-selected file —
        // eagerly fetch+show it on the first successful listing.
        setSelectedPath('AGENT.md');
      },
      (error: unknown) => {
        if (cancelled) return;
        setListState(
          isNotFoundError(error)
            ? { kind: 'gap' }
            : { kind: 'error', message: error instanceof Error ? error.message : String(error) },
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [blueprintId, client, sessionId]);

  useEffect(() => {
    if (!selectedPath) {
      setPreview({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setPreview({ kind: 'loading' });
    void client.readBlueprintFile(blueprintId, selectedPath, { sessionId }).then(
      (result) => {
        if (cancelled) return;
        setPreview(decodeWorkspaceFilePreview(result, selectedPath));
      },
      (error: unknown) => {
        if (cancelled) return;
        setPreview({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [blueprintId, client, sessionId, selectedPath]);

  if (listState.kind === 'gap') {
    return <BlueprintExplorerGap />;
  }
  if (listState.kind === 'error') {
    return (
      <p className="blueprintwindow__empty" role="alert" data-testid="blueprint-window-explorer-error">
        Could not load blueprint files: {listState.message}
      </p>
    );
  }

  const entries = listState.kind === 'ready' ? listState.entries : [];
  const files: FileRow[] = entries.map((entry) => ({
    path: entry.path,
    type: entry.type,
    size: entry.size,
  }));
  const tree = buildFileTree(files);
  const currentNode = findDirNode(tree, currentDir) ?? findDirNode(tree, '');
  const crumbs = breadcrumbSegments(currentDir);

  function enterDirectory(path: string): void {
    setCurrentDir(path);
  }

  return (
    <section
      aria-labelledby="blueprint-explorer-title"
      className="blueprintwindow__section"
      data-testid="blueprint-window-explorer"
    >
      <h3 id="blueprint-explorer-title">files</h3>
      {listState.kind === 'loading' ? (
        <div className="blueprintwindow__empty">
          <Skeleton label="Loading blueprint files…" />
        </div>
      ) : (
        <div className="blueprintwindow__explorer">
          <div className="blueprintwindow__explorertree" data-testid="blueprint-window-explorer-tree">
            {tree.length > 0 ? (
              <nav className="files-layer__crumbs" aria-label="Current blueprint directory">
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
              {currentDir ? (
                <button
                  type="button"
                  className="files-layer__up"
                  onClick={() => enterDirectory(parentPath(currentDir))}
                >
                  <span className="files-layer__chev" aria-hidden="true">
                    ‹
                  </span>
                  <strong>..</strong>
                </button>
              ) : null}
              {currentNode?.children.map((node) => (
                <DirRow
                  key={node.path}
                  node={node}
                  selected={selectedPath}
                  onOpen={() =>
                    node.type === 'directory' ? enterDirectory(node.path) : setSelectedPath(node.path)
                  }
                />
              ))}
              {currentNode && currentNode.children.length === 0 ? (
                <p className="files-layer__empty">This directory is empty.</p>
              ) : null}
              {tree.length === 0 ? <p className="files-layer__empty">No files listed.</p> : null}
            </div>
          </div>
          <div className="blueprintwindow__explorercontent" data-testid="blueprint-window-file-content">
            <ExplorerPreview selectedPath={selectedPath} preview={preview} />
          </div>
        </div>
      )}
    </section>
  );
}

const EXPLORER_CSV_SHOWN_ROWS = 50;

/** Renders the selected blueprint file per its decoded preview kind — same
 * honest conventions as FilesLayer's PreviewBody (raw text stays raw, CSV
 * becomes a bounded table, binary files get a byte-count notice), plus a
 * markdown lane through the shared Markdown module for `.md`/`.markdown`
 * paths (decodeWorkspaceFilePreview reports those as plain `text`, since
 * `.md` isn't specifically an image/binary media type).
 *
 * Blueprint expert files (`experts/main.md`, `AGENT.md`) open with a
 * `---`-delimited YAML frontmatter block *before* their real markdown body
 * (round-7 finding) — unlike transcript prose, which never carries
 * frontmatter, so the shared Markdown module is correctly frontmatter-naive.
 * `splitFrontmatter` peels that leading block off here: it renders as an
 * honest dimmed raw block (never dropped), and only the remainder goes
 * through the block parser — otherwise YAML comment lines inside the
 * frontmatter (`# some note`) collide with the parser's heading token and
 * the raw `key: value` / `---` lines leak into the body as unstyled prose. */
function ExplorerPreview({
  selectedPath,
  preview,
}: {
  selectedPath: string | null;
  preview: ExplorerPreviewState;
}) {
  if (!selectedPath) {
    return <p className="blueprintwindow__empty">Select a file to preview it.</p>;
  }
  if (preview.kind === 'idle' || preview.kind === 'loading') {
    return (
      <div className="blueprintwindow__empty">
        <Skeleton label={`Loading ${selectedPath}…`} />
      </div>
    );
  }
  if (preview.kind === 'error') {
    return (
      <p className="blueprintwindow__empty" role="alert">
        Could not read {selectedPath}: {preview.message}
      </p>
    );
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
      <p className="blueprintwindow__empty" data-testid="blueprint-window-binary-notice">
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
            {preview.rows.slice(0, EXPLORER_CSV_SHOWN_ROWS).map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="files-layer__csvfoot">
          first {Math.min(EXPLORER_CSV_SHOWN_ROWS, preview.rows.length)} of{' '}
          {preview.totalRows.toLocaleString()} rows
        </p>
      </div>
    );
  }
  if (isMarkdownPath(selectedPath)) {
    const { frontmatter, body } = splitFrontmatter(preview.text);
    return (
      <div className="blueprintwindow__markdown" data-testid="blueprint-window-explorer-markdown">
        {frontmatter !== null ? (
          <pre
            className="blueprintwindow__frontmatter"
            data-testid="blueprint-window-explorer-frontmatter"
          >
            <code>{frontmatter}</code>
          </pre>
        ) : null}
        <Markdown text={body} />
      </div>
    );
  }
  return (
    <pre className="files-layer__content">
      <code>{preview.text}</code>
    </pre>
  );
}

/**
 * Honest, typed gap notice: the fallback for a clio host that predates
 * #1192 — no backend surface to list or read the blueprint's OTHER files
 * (experts/*.md, tools/, …), only the AGENT.md body above, via
 * `agent_blueprint.metadata.body`. `BlueprintFileExplorer` renders this
 * only when `listBlueprintFiles` fails with a 404 (route not present);
 * any other failure gets a distinct honest error message instead so a
 * real bug is never misattributed as a version mismatch.
 *
 * `GET /v1/workspaces/{wid}/files[/read]` (clio-agent
 * routes/workspaces.py, mounted per-workspace) only resolves a REGISTERED
 * workspace id's root_path; a blueprint's root is an arbitrary filesystem
 * path with no workspace registration, and the blueprint routes themselves
 * (clio-agent routes/blueprints.py:210-332, `register_blueprints_routes`)
 * expose metadata + agents + mcp_descriptors only — no directory listing, no
 * per-file read. The nearest existing route is
 * `GET /v1/agent-blueprints/{blueprint_id}` at routes/blueprints.py:298-332.
 */
function BlueprintExplorerGap() {
  return (
    <p className="blueprintwindow__gap" data-testid="blueprint-window-explorer-gap">
      Full file explorer (experts/*.md, tools/) is not backed yet — the server
      has no directory-listing or per-file-read route for a blueprint's root
      (nearest existing route: <code>GET /v1/agent-blueprints/&#123;id&#125;</code>,
      clio-agent <code>routes/blueprints.py:298</code>, metadata only). Only
      the AGENT.md body above is available today.
    </p>
  );
}

function JsonSection({ title, value }: { title: string; value: unknown }) {
  return (
    <section aria-labelledby={`blueprint-${title}-title`} className="blueprintwindow__section">
      <h3 id={`blueprint-${title}-title`}>{title}</h3>
      <pre className="blueprintwindow__json">{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}
