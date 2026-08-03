/**
 * UI component: Diff Pane Header. Exports `DiffPaneHeader`.
 */
import { Show } from 'solid-js';
import type { FileDiffStatusBadge } from './DiffPaneModel.js';

export function DiffPaneHeader(props: {
  path?: string;
  displayPath: string;
  totalAdds: number;
  totalRemoves: number;
  /** v0.2 status badge (pending / applied / rejected / apply_failed); null when omitted. */
  statusBadge?: FileDiffStatusBadge | null;
  /** v0.2 edit_mode short label (diff / whole-file / patch); null when omitted. */
  editModeLabel?: string | null;
  onClose: () => void;
}) {
  return (
    <header class="diffpane__head">
      <div>
        <span class="eyebrow">diff preview</span>
        <h2 class="diffpane__path" title={props.path} aria-label={props.path}>
          {props.displayPath}
        </h2>
        <Show when={props.statusBadge ?? props.editModeLabel}>
          <div class="diffpane__meta">
            <Show when={props.statusBadge}>
              {(badge) => (
                <span
                  class={`chip chip--${badge().tone} diffpane__status`}
                  data-testid="diff-pane-status"
                  data-status={badge().status}
                >
                  {badge().label}
                </span>
              )}
            </Show>
            <Show when={props.editModeLabel}>
              {(label) => (
                <span class="chip diffpane__editmode" data-testid="diff-pane-editmode">
                  {label()}
                </span>
              )}
            </Show>
          </div>
        </Show>
      </div>
      <div class="diffpane__stats">
        <span class="chip chip--ok" data-testid="diff-pane-adds">
          +{props.totalAdds}
        </span>
        <span class="chip chip--err" data-testid="diff-pane-dels">
          −{props.totalRemoves}
        </span>
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
  );
}
