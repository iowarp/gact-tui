/**
 * Renders a `file_diff` transcript part (a proposed file edit) inline.
 * Exports {@link FileDiffPartView}.
 */
import { Show } from 'solid-js';
import type { FileDiff } from '@clio/core';
import { Icon } from './Icon.js';
import {
  fileDiffEditModeLabel,
  fileDiffLineCounts,
  fileDiffStatusBadge,
} from './DiffPaneModel.js';

interface FileDiffStats {
  adds: number;
  dels: number;
}

export function FileDiffPartView(props: {
  part: FileDiff;
  onOpenDiff?: (diff: FileDiff) => void;
  onPinFile?: (path: string) => void;
}) {
  const path = props.part.path;
  // Prefer the v0.2 wire tally (`lines_added`/`lines_removed`); fall back to the
  // diff-derived count for v0.1 fixtures.
  const stats = () => fileDiffLineCounts(props.part, fileDiffStats(props.part));
  const statusBadge = () => fileDiffStatusBadge(props.part);
  const editModeLabel = () => fileDiffEditModeLabel(props.part);
  return (
    <div class="trx-filediff-wrap">
      <button
        type="button"
        class="trx-filediff"
        data-testid="filediff-chip"
        onClick={() => props.onOpenDiff?.(props.part)}
      >
        <Icon name="diff" size={14} />
        <div class="trx-filediff__chip">
          <span class="trx-filediff__path">{path}</span>
          <Show when={statusBadge()}>
            {(badge) => (
              <span
                class={`chip chip--${badge().tone} trx-filediff__status`}
                data-testid="filediff-status"
                data-status={badge().status}
              >
                {badge().label}
              </span>
            )}
          </Show>
          <Show when={editModeLabel()}>
            {(label) => (
              <span class="trx-filediff__editmode" data-testid="filediff-editmode">
                {label()}
              </span>
            )}
          </Show>
          <span class="trx-filediff__stats">
            <span class="trx-filediff__plus">+{stats().adds}</span>
            <span class="trx-filediff__minus">−{stats().dels}</span>
          </span>
        </div>
      </button>
      <Show when={props.onPinFile}>
        <button
          type="button"
          class="trx-filediff-pin"
          data-testid={`filediff-pin-${path}`}
          title="Pin this file to session context"
          onClick={() => props.onPinFile?.(path)}
        >
          <Icon name="pin" size={12} />
        </button>
      </Show>
    </div>
  );
}

function fileDiffStats(part: FileDiff): FileDiffStats {
  const ud = part.unified_diff ?? '';
  if (ud) {
    const adds = ud
      .split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++')).length;
    const dels = ud
      .split('\n')
      .filter((line) => line.startsWith('-') && !line.startsWith('---')).length;
    return { adds, dels };
  }
  const beforeLines = (part.before ?? '').split('\n').length;
  const afterLines = (part.after ?? '').split('\n').length;
  const adds = Math.max(0, afterLines - beforeLines);
  const dels = Math.max(0, beforeLines - afterLines);
  return { adds, dels };
}
