import {
  createSignal,
  createResource,
  createMemo,
  createEffect,
  onMount,
  For,
  Show,
  type Accessor,
} from 'solid-js';
import type { Client, WorkspaceFileEntry, ContextFileContent } from '@clio/core';
import { Icon } from './Icon.js';
import { getHljs, hljsSync } from '../hljs-lazy.js';
import './preview-rail.css';

/**
 * Right-side, collapsible preview rail — the "you can't do this in a terminal"
 * feature. A workspace file browser (built from the flat
 * `listWorkspaceFiles` tree) on top, a rendered preview pane below:
 *
 *   - images   → <img> from a base64 data URL
 *   - text/code → syntax-highlighted <pre> (highlight.js, lazy) when the
 *                 extension is known, plain escaped text otherwise
 *   - large/binary → an honest icon + size placeholder, no attempt to render
 *
 * The rail consumes core's `listWorkspaceFiles` / `readWorkspaceFile`
 * (workspace-scoped, GET endpoints already wired in @clio/core). It never
 * mutates anything.
 *
 * Width yields to chat: the host `.chat` grid column uses a CSS clamp so the
 * conversation can never be crushed below its minimum (see preview-rail.css /
 * chat.css). Open/closed state is persisted by the caller (ChatScreen).
 */

/** Largest text payload we will syntax-highlight / render inline. Anything
 * bigger gets the placeholder so we never freeze the renderer on a 5 MB log. */
const TEXT_PREVIEW_CAP = 512 * 1024; // 512 kB, mirrors DiffPane's cap

export interface PreviewRailProps {
  /** Active session's workspace id. When absent the rail shows an empty state
   * (no workspace → nothing to browse). */
  workspaceId: string | undefined;
  /** Core client used for the two read-only workspace endpoints. */
  client: Pick<Client, 'listWorkspaceFiles' | 'readWorkspaceFile'>;
  /** Close affordance — flips the persisted open flag in the host. */
  onClose: () => void;
  /** Optional externally-driven selection (e.g. clicking a context file in
   * the Inspector). When this changes to a non-empty path the rail selects
   * and previews it. */
  externalPath?: Accessor<string | undefined>;
}

/** A node in the tree we synthesize from the flat path list. */
interface TreeNode {
  name: string;
  /** Full workspace-relative path, normalized to forward slashes. */
  path: string;
  type: 'file' | 'dir';
  size?: number;
  children: TreeNode[];
}

/** Split on either separator — clio returns OS-native paths (backslashes on
 * a Windows host, forward slashes elsewhere). Normalize to '/'. */
function splitPath(p: string): string[] {
  return p.split(/[\\/]+/).filter((s) => s.length > 0);
}

function normalizePath(p: string): string {
  return splitPath(p).join('/');
}

/** Build a nested tree from the flat entry list. Directories that only appear
 * implicitly (as a parent of a file) are synthesized so the browser is
 * navigable even if the backend omits explicit dir rows. */
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

  for (const e of entries) {
    const parts = splitPath(e.path);
    if (parts.length === 0) continue;
    const name = parts[parts.length - 1]!;
    const parentParts = parts.slice(0, -1);
    const parent = ensureDir(parentParts);
    const full = parts.join('/');
    if (e.type === 'dir') {
      if (!dirIndex.has(full)) {
        const node: TreeNode = { name, path: full, type: 'dir', children: [] };
        dirIndex.set(full, node);
        parent.children.push(node);
      }
    } else {
      // Guard against a file path that collides with a synthesized dir.
      if (!parent.children.some((c) => c.path === full && c.type === 'file')) {
        parent.children.push({
          name,
          path: full,
          type: 'file',
          size: e.size,
          children: [],
        });
      }
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
  for (const c of node.children) if (c.type === 'dir') sortTree(c);
}

/** Flatten the tree to the rows currently visible given the expanded set and
 * an optional filter. When filtering we show every file whose path contains
 * the query (case-insensitive) plus their ancestor dirs, all expanded. */
export function flattenVisible(
  nodes: TreeNode[],
  expanded: Set<string>,
  filter: string,
): Array<{ node: TreeNode; depth: number }> {
  const q = filter.trim().toLowerCase();
  const out: Array<{ node: TreeNode; depth: number }> = [];

  function matches(node: TreeNode): boolean {
    if (!q) return true;
    if (node.type === 'file') return node.path.toLowerCase().includes(q);
    return node.children.some(matches);
  }

  function walk(list: TreeNode[], depth: number): void {
    for (const node of list) {
      if (!matches(node)) continue;
      out.push({ node, depth });
      if (node.type === 'dir') {
        const open = q ? true : expanded.has(node.path);
        if (open) walk(node.children, depth + 1);
      }
    }
  }
  walk(nodes, 0);
  return out;
}

const LANG_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  rb: 'ruby',
  sh: 'bash',
  bash: 'bash',
  css: 'css',
  html: 'xml',
  xml: 'xml',
  svg: 'xml',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  md: 'markdown',
  sql: 'sql',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  kt: 'kotlin',
  swift: 'swift',
};

function extOf(path: string): string {
  const name = splitPath(path).pop() ?? path;
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function langForPath(path: string): string | null {
  return LANG_BY_EXT[extOf(path)] ?? null;
}

export type PreviewKind = 'image' | 'text' | 'binary';

/** Decide how to render a payload from its media type + size. Exposed for
 * tests. */
export function classifyPreview(content: ContextFileContent): PreviewKind {
  const mt = (content.media_type || '').toLowerCase();
  if (mt.startsWith('image/')) return 'image';
  const texty =
    mt.startsWith('text/') ||
    mt.includes('json') ||
    mt.includes('xml') ||
    mt.includes('javascript') ||
    mt.includes('typescript') ||
    mt.includes('yaml') ||
    mt === 'application/octet-stream'; // octet-stream files are often code
  if (!texty) return 'binary';
  if (content.size > TEXT_PREVIEW_CAP) return 'binary';
  return 'text';
}

/** Decode the base64 payload to a UTF-8 string for text previews. */
function decodeText(content: ContextFileContent): string {
  try {
    const bin = atob(content.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function humanSize(n: number | undefined): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function PreviewRail(props: PreviewRailProps) {
  const [filter, setFilter] = createSignal('');
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set());
  const [selected, setSelected] = createSignal<string>('');

  // highlight.js loads lazily; flip this once it's ready to re-run the
  // highlight memo (plain escaped text renders until then — no blank flash).
  const [hljsReady, setHljsReady] = createSignal(hljsSync() !== null);
  onMount(() => {
    if (hljsSync()) return;
    void getHljs().then(() => setHljsReady(true));
  });

  // File tree — refetches when the workspace changes. Errors are folded into
  // the success value (a `{ error }` shape) rather than thrown, so a failed
  // fetch never becomes an unhandled rejection — we render an honest error
  // row instead.
  const [listing] = createResource(
    () => props.workspaceId,
    async (wid): Promise<{ entries: WorkspaceFileEntry[]; error?: true }> => {
      try {
        const res = await props.client.listWorkspaceFiles(wid);
        return { entries: res.entries };
      } catch {
        return { entries: [], error: true };
      }
    },
  );

  const listError = createMemo(() => listing()?.error === true);
  const tree = createMemo(() => buildTree(listing()?.entries ?? []));
  const rows = createMemo(() =>
    flattenVisible(tree(), expanded(), filter()),
  );

  // Selected file content — refetches when (workspace, selected) changes.
  // Like the listing, read errors are folded into the value as `{ error }`
  // so they never surface as unhandled rejections.
  const [content] = createResource(
    () => {
      const wid = props.workspaceId;
      const path = selected();
      if (!wid || !path) return null;
      return { wid, path };
    },
    async (
      key,
    ): Promise<{ content?: ContextFileContent; error?: true } | null> => {
      if (!key) return null;
      try {
        return { content: await props.client.readWorkspaceFile(key.wid, key.path) };
      } catch {
        return { error: true };
      }
    },
  );
  const fileContent = createMemo(() => content()?.content ?? null);
  const readError = createMemo(() => content()?.error === true);

  // External selection (Inspector context-file click): adopt it.
  createEffect(() => {
    const ext = props.externalPath?.();
    if (ext) setSelected(normalizePath(ext));
  });

  function toggleDir(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function onRowClick(node: TreeNode) {
    if (node.type === 'dir') toggleDir(node.path);
    else setSelected(node.path);
  }

  const kind = createMemo<PreviewKind | null>(() => {
    const c = fileContent();
    return c ? classifyPreview(c) : null;
  });

  const dataUrl = createMemo(() => {
    const c = fileContent();
    if (!c || kind() !== 'image') return '';
    return `data:${c.media_type};base64,${c.data}`;
  });

  const textBody = createMemo(() => {
    const c = fileContent();
    if (!c || kind() !== 'text') return '';
    return decodeText(c);
  });

  const highlighted = createMemo(() => {
    if (kind() !== 'text') return null;
    const c = fileContent();
    if (!c) return null;
    const src = textBody();
    void hljsReady(); // dependency
    const hljs = hljsSync();
    const lang = langForPath(c.path);
    if (hljs && lang) {
      try {
        return hljs.highlight(src, { language: lang }).value;
      } catch {
        // fall through to escaped plain text
      }
    }
    return escapeHtml(src);
  });

  return (
    <aside class="preview-rail" data-testid="preview-rail">
      <header class="preview-rail__head">
        <span class="preview-rail__title">
          <Icon name="folder" size={14} />
          Files
        </span>
        <button
          type="button"
          class="preview-rail__close"
          title="Close preview rail"
          data-testid="preview-rail-close"
          onClick={props.onClose}
        >
          <Icon name="close" size={14} />
        </button>
      </header>

      <div class="preview-rail__browser" data-testid="preview-rail-browser">
        <div class="preview-rail__search">
          <Icon name="search" size={13} />
          <input
            type="text"
            class="preview-rail__search-input"
            placeholder="Filter files…"
            value={filter()}
            data-testid="preview-rail-filter"
            onInput={(e) => setFilter(e.currentTarget.value)}
          />
        </div>

        <div class="preview-rail__list" role="tree">
          <Show
            when={props.workspaceId}
            fallback={
              <p class="preview-rail__empty" data-testid="preview-rail-no-workspace">
                No workspace for this session.
              </p>
            }
          >
            <Show
              when={!listing.loading}
              fallback={
                <p class="preview-rail__empty">Loading files…</p>
              }
            >
              <Show
                when={!listError()}
                fallback={
                  <p
                    class="preview-rail__empty preview-rail__empty--err"
                    data-testid="preview-rail-list-error"
                  >
                    Could not load files.
                  </p>
                }
              >
                <Show
                  when={rows().length > 0}
                  fallback={
                    <p class="preview-rail__empty" data-testid="preview-rail-empty">
                      {filter() ? 'No files match.' : 'Workspace is empty.'}
                    </p>
                  }
                >
                  <For each={rows()}>
                    {(row) => (
                      <button
                        type="button"
                        class={
                          'preview-rail__row' +
                          (row.node.type === 'dir'
                            ? ' preview-rail__row--dir'
                            : ' preview-rail__row--file') +
                          (selected() === row.node.path
                            ? ' is-selected'
                            : '')
                        }
                        style={{ 'padding-left': `${8 + row.depth * 14}px` }}
                        data-testid={`preview-rail-row-${row.node.path}`}
                        data-type={row.node.type}
                        role="treeitem"
                        onClick={() => onRowClick(row.node)}
                      >
                        <Show
                          when={row.node.type === 'dir'}
                          fallback={
                            <span class="preview-rail__row-icon">
                              <Icon name="file" size={13} />
                            </span>
                          }
                        >
                          <span
                            class={
                              'preview-rail__row-caret' +
                              (expanded().has(row.node.path) || filter()
                                ? ' is-open'
                                : '')
                            }
                          >
                            <Icon name="chevron-right" size={12} />
                          </span>
                        </Show>
                        <span class="preview-rail__row-name">
                          {row.node.name}
                        </span>
                        <Show when={row.node.type === 'file' && row.node.size != null}>
                          <span class="preview-rail__row-size">
                            {humanSize(row.node.size)}
                          </span>
                        </Show>
                      </button>
                    )}
                  </For>
                </Show>
              </Show>
            </Show>
          </Show>
        </div>
      </div>

      <div class="preview-rail__preview" data-testid="preview-rail-preview">
        <Show
          when={selected()}
          fallback={
            <div class="preview-rail__placeholder" data-testid="preview-rail-no-selection">
              <Icon name="file" size={22} />
              <p>Select a file to preview it side-by-side.</p>
            </div>
          }
        >
          <div class="preview-rail__preview-head">
            <span class="preview-rail__preview-path" title={selected()}>
              {selected()}
            </span>
            <Show when={fileContent()}>
              <span class="preview-rail__preview-size">
                {humanSize(fileContent()!.size)}
              </span>
            </Show>
          </div>

          <div class="preview-rail__preview-body">
            <Show
              when={!content.loading}
              fallback={
                <div class="preview-rail__placeholder">Loading…</div>
              }
            >
              <Show
                when={!readError()}
                fallback={
                  <div
                    class="preview-rail__placeholder preview-rail__placeholder--err"
                    data-testid="preview-rail-read-error"
                  >
                    <Icon name="alert" size={22} />
                    <p>Could not read this file.</p>
                  </div>
                }
              >
                <Show when={kind() === 'image'}>
                  <div class="preview-rail__image-wrap" data-testid="preview-rail-image">
                    <img
                      class="preview-rail__image"
                      src={dataUrl()}
                      alt={selected()}
                    />
                  </div>
                </Show>

                <Show when={kind() === 'text'}>
                  <pre
                    class="preview-rail__code hljs"
                    data-testid="preview-rail-text"
                  ><code innerHTML={highlighted() ?? ''} /></pre>
                </Show>

                <Show when={kind() === 'binary'}>
                  <div
                    class="preview-rail__placeholder"
                    data-testid="preview-rail-binary"
                  >
                    <Icon name="file" size={22} />
                    <p>
                      {fileContent() && fileContent()!.size > TEXT_PREVIEW_CAP
                        ? 'File too large to preview inline.'
                        : 'Binary file — no inline preview.'}
                    </p>
                    <p class="preview-rail__placeholder-meta">
                      {fileContent()?.media_type} ·{' '}
                      {humanSize(fileContent()?.size)}
                    </p>
                  </div>
                </Show>
              </Show>
            </Show>
          </div>
        </Show>
      </div>
    </aside>
  );
}
