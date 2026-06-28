/**
 * UI component: Diff Pane. Renders `DiffPane` from `DiffPaneProps`.
 */
import { For, createSignal, Show, onMount } from 'solid-js';
import { getHljs, hljsSync } from '../hljs-lazy.js';
import type { FileDiff } from '@clio/core';
import { DiffPaneEmpty } from './DiffPaneEmpty.js';
import { DiffPaneHeader } from './DiffPaneHeader.js';
import { DiffPaneLine } from './DiffPaneLine.js';
import {
  compactDiffPath,
  fileDiffEditModeLabel,
  fileDiffLineCounts,
  fileDiffStatusBadge,
  langForPath,
  parseHunks,
} from './DiffPaneModel.js';
import './diff-pane.css';

export { compactDiffPath } from './DiffPaneModel.js';

export interface DiffPaneProps {
  diff: FileDiff;
  onClose: () => void;
  /**
   * Called when the user marks a hunk as reviewed. Backend writeback is
   * handled by the session-level pending-diffs actions in the Inspector when
   * CLIO reports real `/diffs` rows; this pane is a per-turn diff preview.
   */
  onApplyHunk?: (hunkIndex: number) => void;
  onRejectHunk?: (hunkIndex: number) => void;
}

type HunkState = 'pending' | 'applied' | 'rejected';

/**
 * Multi-buffer diff viewer for file_diff Parts (Wave 4 + W3 Tier-2).
 *
 * Parses the `unified_diff` field into hunks and renders each with
 * its own local review buttons, an old/new line-number gutter, and
 * per-line syntax highlighting (language inferred from the file
 * extension; hljs escapes the source so innerHTML is injection-safe).
 */
export function DiffPane(props: DiffPaneProps) {
  const hunks = () => parseHunks(props.diff.unified_diff ?? '');
  const lang = () => langForPath(props.diff.path ?? '');
  const displayPath = () => compactDiffPath(props.diff.path ?? 'diff');
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

  // Prefer the v0.2 wire tally (`lines_added`/`lines_removed`) — the backend's
  // own count — and fall back to summing the parsed hunks for v0.1 fixtures.
  const counts = () =>
    fileDiffLineCounts(props.diff, {
      adds: hunks().reduce((s, h) => s + h.adds, 0),
      dels: hunks().reduce((s, h) => s + h.dels, 0),
    });
  const total = () => counts().adds;
  const removes = () => counts().dels;
  const statusBadge = () => fileDiffStatusBadge(props.diff);
  const editModeLabel = () => fileDiffEditModeLabel(props.diff);

  function set(i: number, v: HunkState) {
    const arr = states().slice();
    arr[i] = v;
    setStates(arr);
  }

  return (
    <aside class="diffpane" data-testid="diff-pane">
      <DiffPaneHeader
        path={props.diff.path}
        displayPath={displayPath()}
        totalAdds={total()}
        totalRemoves={removes()}
        statusBadge={statusBadge()}
        editModeLabel={editModeLabel()}
        onClose={props.onClose}
      />

      <Show
        when={hunks().length > 0}
        fallback={<DiffPaneEmpty raw={props.diff.unified_diff ?? ''} />}
      >
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
                      Mark reviewed
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
                      Skip
                    </button>
                  </div>
                </header>
                <pre class="diffpane__hunk-body">
                  <For each={hunk.lines}>
                    {(ln) => <DiffPaneLine line={ln} lang={lang()} ready={hljsReady()} />}
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
