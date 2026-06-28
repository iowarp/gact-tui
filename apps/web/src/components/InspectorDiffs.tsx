/**
 * Inspector "Diffs" tab: shows file diffs for the current turn plus the
 * session-wide applied-diff history, each opening into the diff pane.
 */
import { For, Show } from 'solid-js';
import type { FileDiff } from '@clio/core';
import { Icon } from './Icon.js';

export interface SessionDiffRow {
  path: string;
  applied?: boolean;
  message_id?: string;
}

export interface DiffsTabProps {
  turnDiffs: FileDiff[];
  sessionDiffs?: SessionDiffRow[];
  onOpenDiff?: (diff: FileDiff) => void;
  onApplyAllDiffs?: () => void | Promise<void>;
  onRejectAllDiffs?: () => void | Promise<void>;
}

export function DiffsTab(props: DiffsTabProps) {
  const hasTurnDiffs = () => props.turnDiffs.length > 0;
  const hasSessionDiffs = () => !!props.sessionDiffs && props.sessionDiffs.length > 0;

  return (
    <section class="inspector__sect">
      <Show when={hasTurnDiffs()}>
        <div class="inspector__sect-title">This turn's diffs</div>
        <ul class="inspector__diffs">
          <For each={props.turnDiffs}>
            {(d) => (
              <li
                class={'inspector__diff ' + (props.onOpenDiff ? 'inspector__diff--click' : '')}
                data-testid={`inspector-diff-${d.path}`}
                onClick={() => props.onOpenDiff?.(d)}
              >
                <Icon name="diff" size={14} />
                <span class="inspector__diff-path">{d.path}</span>
                <Show when={d.applied}>
                  <span class="inspector__chip inspector__chip--ok">applied</span>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={hasSessionDiffs()}>
        <div class="inspector__sect-title">
          All pending in session ({props.sessionDiffs!.length})
        </div>
        <Show when={props.onApplyAllDiffs || props.onRejectAllDiffs}>
          <div class="inspector__bulk-actions">
            <Show when={props.onApplyAllDiffs}>
              <button
                type="button"
                class="inspector__bulk-btn"
                onClick={() => void props.onApplyAllDiffs?.()}
                data-testid="inspector-diffs-apply-all"
              >
                Apply all
              </button>
            </Show>
            <Show when={props.onRejectAllDiffs}>
              <button
                type="button"
                class="inspector__bulk-btn inspector__bulk-btn--danger"
                onClick={() => void props.onRejectAllDiffs?.()}
                data-testid="inspector-diffs-reject-all"
              >
                Reject all
              </button>
            </Show>
          </div>
        </Show>
        <ul class="inspector__diffs">
          <For each={props.sessionDiffs}>
            {(d) => (
              <li class="inspector__diff" data-testid={`inspector-sdiff-${d.path}`}>
                <Icon name="diff" size={14} />
                <span class="inspector__diff-path">{d.path}</span>
                <Show when={d.applied}>
                  <span class="inspector__chip inspector__chip--ok">applied</span>
                </Show>
                <Show when={!d.applied}>
                  <span class="inspector__chip">pending</span>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}
