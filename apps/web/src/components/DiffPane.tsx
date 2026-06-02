import { For, createSignal, Show, onMount } from 'solid-js';
import { getHljs, hljsSync } from '../hljs-lazy.js';
import type { FileDiff } from '@clio/core';
import './diff-pane.css';

export interface DiffPaneProps {
  diff: FileDiff;
  onClose: () => void;
  /**
   * Called when the user resolves a hunk. v0.9 lands the UI + per-hunk
   * state; the actual writeback POST lands when the GACT v0.2 diff
   * apply endpoint comes online in clio-agent-gact (CLIO-BBBBBBBBBB12).
   */
  onApplyHunk?: (hunkIndex: number) => void;
  onRejectHunk?: (hunkIndex: number) => void;
}

type HunkState = 'pending' | 'applied' | 'rejected';

/**
 * Multi-buffer diff viewer for file_diff Parts (Wave 4 + W3 Tier-2).
 *
 * Parses the `unified_diff` field into hunks and renders each with
 * its own Apply / Reject buttons, an old/new line-number gutter, and
 * per-line syntax highlighting (language inferred from the file
 * extension; hljs escapes the source so innerHTML is injection-safe).
 */
export function DiffPane(props: DiffPaneProps) {
  const hunks = () => parseHunks(props.diff.unified_diff ?? '');
  const lang = () => langForPath(props.diff.path ?? '');
  const [states, setStates] = createSignal<HunkState[]>([]);
  // highlight.js loads on demand (see hljs-lazy). Lines render plain until
  // it resolves, then this signal flips and the per-line highlight re-runs.
  const [hljsReady, setHljsReady] = createSignal(hljsSync() !== null);

  onMount(() => {
    if (hljsSync()) {
      setHljsReady(true);
      return;
    }
    void getHljs().then(() => setHljsReady(true));
  });

  // Initialize states array when hunks length changes.
  const ensure = () => {
    const arr = states();
    const len = hunks().length;
    if (arr.length !== len) {
      setStates(new Array(len).fill('pending') as HunkState[]);
    }
  };

  const total = () => hunks().reduce((s, h) => s + h.adds, 0);
  const removes = () => hunks().reduce((s, h) => s + h.dels, 0);

  function set(i: number, v: HunkState) {
    const arr = states().slice();
    arr[i] = v;
    setStates(arr);
  }

  return (
    <aside class="diffpane" data-testid="diff-pane">
      <header class="diffpane__head">
        <div>
          <span class="eyebrow">file_diff</span>
          <h2 class="diffpane__path">{props.diff.path}</h2>
        </div>
        <div class="diffpane__stats">
          <span class="chip chip--ok">+{total()}</span>
          <span class="chip chip--err">−{removes()}</span>
          <button
            type="button"
            class="diffpane__close"
            data-testid="diff-pane-close"
            onClick={props.onClose}
          >
            ✕
          </button>
        </div>
      </header>

      <Show when={hunks().length > 0} fallback={<NoHunks raw={props.diff.unified_diff ?? ''} />}>
        {(() => {
          ensure();
          return null;
        })()}
        <ol class="diffpane__hunks">
          <For each={hunks()}>
            {(hunk, i) => (
              <li
                class={'diffpane__hunk diffpane__hunk--' + (states()[i()] ?? 'pending')}
                data-testid={`diff-pane-hunk-${i()}`}
              >
                <header class="diffpane__hunk-head">
                  <span class="diffpane__hunk-loc">{hunk.header}</span>
                  <div class="diffpane__hunk-actions">
                    <button
                      type="button"
                      class="btn btn--primary"
                      data-testid={`diff-pane-apply-${i()}`}
                      disabled={states()[i()] !== 'pending'}
                      onClick={() => {
                        set(i(), 'applied');
                        props.onApplyHunk?.(i());
                      }}
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      class="btn btn--secondary"
                      data-testid={`diff-pane-reject-${i()}`}
                      disabled={states()[i()] !== 'pending'}
                      onClick={() => {
                        set(i(), 'rejected');
                        props.onRejectHunk?.(i());
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </header>
                <pre class="diffpane__hunk-body">
                  <For each={hunk.lines}>
                    {(ln) => <DiffLine line={ln} lang={lang()} ready={hljsReady()} />}
                  </For>
                </pre>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </aside>
  );
}

function DiffLine(p: { line: DiffLineInfo; lang: string | null; ready: boolean }) {
  // Per-line highlighting loses multi-line constructs (block comments) but
  // is the standard approach for diff viewers — each line stands alone.
  const content = () => p.line.text.slice(1); // strip the +/-/space sign
  const highlighted = () => {
    // `p.ready` gates on hljs having loaded so this re-runs once it lands.
    if (!p.ready || !p.lang || !content()) return null;
    const hljs = hljsSync();
    if (!hljs) return null;
    try {
      return hljs.highlight(content(), { language: p.lang }).value;
    } catch {
      return null;
    }
  };
  return (
    <div class={'diffpane__line diffpane__line--' + p.line.sign}>
      {/* Old/new line-number gutter (W3 Tier-2). Non-selectable so copying
          the diff body doesn't pick up the numbers. */}
      <span class="diffpane__lineno" aria-hidden="true">
        {p.line.oldNo ?? ''}
      </span>
      <span class="diffpane__lineno" aria-hidden="true">
        {p.line.newNo ?? ''}
      </span>
      <span class="diffpane__line-sign" aria-hidden="true">
        {p.line.sign === 'add' ? '+' : p.line.sign === 'del' ? '−' : ' '}
      </span>
      <Show when={highlighted() !== null} fallback={<code class="diffpane__line-code">{content() || ' '}</code>}>
        {/* hljs HTML-escapes the source, so this markup is injection-safe. */}
        <code class="diffpane__line-code hljs" innerHTML={highlighted()!} />
      </Show>
    </div>
  );
}

function NoHunks(p: { raw: string }) {
  return (
    <div class="diffpane__nohunks">
      <p>
        Diff has no parseable hunks. Raw payload:
      </p>
      <pre>{p.raw || '(empty)'}</pre>
    </div>
  );
}

interface DiffLineInfo {
  /** Raw line including the +/-/space prefix. */
  text: string;
  sign: 'add' | 'del' | 'ctx';
  /** Line number in the OLD file (null for added lines). */
  oldNo: number | null;
  /** Line number in the NEW file (null for deleted lines). */
  newNo: number | null;
}

interface Hunk {
  header: string;
  lines: DiffLineInfo[];
  adds: number;
  dels: number;
}

/** Map a file path to an hljs language id (per-line highlight). */
function langForPath(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
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
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
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
    toml: 'ini',
    ini: 'ini',
  };
  return map[ext] ?? null;
}

function parseHunks(unified: string): Hunk[] {
  const lines = unified.split(/\r?\n/);
  const out: Hunk[] = [];
  let current: Hunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  for (const ln of lines) {
    if (ln.startsWith('@@')) {
      if (current) out.push(current);
      current = { header: ln, lines: [], adds: 0, dels: 0 };
      // `@@ -oldStart,oldCount +newStart,newCount @@` → seed the gutter.
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(ln);
      oldNo = m ? parseInt(m[1]!, 10) : 1;
      newNo = m ? parseInt(m[2]!, 10) : 1;
      continue;
    }
    if (!current) continue;
    if (ln.startsWith('+++') || ln.startsWith('---')) continue;
    if (ln.startsWith('+')) {
      current.lines.push({ text: ln, sign: 'add', oldNo: null, newNo: newNo++ });
      current.adds++;
    } else if (ln.startsWith('-')) {
      current.lines.push({ text: ln, sign: 'del', oldNo: oldNo++, newNo: null });
      current.dels++;
    } else {
      current.lines.push({ text: ln, sign: 'ctx', oldNo: oldNo++, newNo: newNo++ });
    }
  }
  if (current) out.push(current);
  return out;
}
