import { For, createSignal, Show } from 'solid-js';
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
 * Multi-buffer diff viewer for file_diff Parts (Wave 4).
 *
 * Parses the `unified_diff` field into hunks and renders each with
 * its own Apply / Reject buttons. The unified-diff parser is
 * intentionally simple — it groups @@ headers + their following
 * lines and trusts the backend to emit well-formed diffs (clio-agent
 * uses its `fs_propose_edit` tool which produces canonical hunks).
 */
export function DiffPane(props: DiffPaneProps) {
  const hunks = () => parseHunks(props.diff.unified_diff ?? '');
  const [states, setStates] = createSignal<HunkState[]>([]);

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
                  <For each={hunk.lines}>{(ln) => <DiffLine line={ln} />}</For>
                </pre>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </aside>
  );
}

function DiffLine(p: { line: string }) {
  const sign = p.line.startsWith('+')
    ? 'add'
    : p.line.startsWith('-')
      ? 'del'
      : 'ctx';
  return <div class={'diffpane__line diffpane__line--' + sign}>{p.line || ' '}</div>;
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

interface Hunk {
  header: string;
  lines: string[];
  adds: number;
  dels: number;
}

function parseHunks(unified: string): Hunk[] {
  const lines = unified.split(/\r?\n/);
  const out: Hunk[] = [];
  let current: Hunk | null = null;
  for (const ln of lines) {
    if (ln.startsWith('@@')) {
      if (current) out.push(current);
      current = { header: ln, lines: [], adds: 0, dels: 0 };
      continue;
    }
    if (!current) continue;
    if (ln.startsWith('+++') || ln.startsWith('---')) continue;
    current.lines.push(ln);
    if (ln.startsWith('+')) current.adds++;
    else if (ln.startsWith('-')) current.dels++;
  }
  if (current) out.push(current);
  return out;
}
