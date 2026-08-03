/**
 * UI component: Session List Item Content. Exports `SessionListItemTitle`.
 */
import { Show } from 'solid-js';
import { formatSessionCost } from '../formatters.js';
import { Icon } from './Icon.js';
import type { SessionRow } from './SessionsColumnModel.js';
import { normalizedSessionTitle } from './SessionListItemModel.js';

export function SessionListItemTitle(props: {
  row: SessionRow;
  editing: boolean;
  draft: string;
  canRename: boolean;
  onDraft: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onStartRename: () => void;
  onEditRef: (el: HTMLInputElement) => void;
}) {
  return (
    <div class="sx__row-title-row">
      <Show
        when={props.editing}
        fallback={
          <span
            class={'sx__row-title ' + (!props.row.title.trim() ? 'sx__row-title--empty' : '')}
            ondblclick={(e) => {
              if (!props.canRename) return;
              e.stopPropagation();
              e.preventDefault();
              props.onStartRename();
            }}
          >
            {normalizedSessionTitle(props.row.title)}
            <Show when={props.row.parentId}>
              <span class="sx__row-fork" title={`Forked from ${props.row.parentId!.slice(0, 8)}`}>
                ↘
              </span>
            </Show>
          </span>
        }
      >
        <input
          ref={props.onEditRef}
          type="text"
          class="sx__row-title-input"
          value={props.draft}
          onClick={(e) => e.stopPropagation()}
          onInput={(e) => props.onDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              props.onCommitRename();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              props.onCancelRename();
            }
          }}
          onBlur={props.onCommitRename}
        />
      </Show>
      <Show when={props.row.pinned}>
        <span
          class="sx__row-pin"
          title="Pinned"
          aria-label="Pinned"
          data-testid={`session-row-pinned-${props.row.id}`}
        >
          <Icon name="pin" size={10} />
        </span>
      </Show>
      <span class="sx__row-when">{props.row.updatedAt}</span>
    </div>
  );
}

export function SessionListItemMeta(props: {
  workspaceLabel?: string;
  model?: string;
  costUsd?: number;
}) {
  return (
    <div class="sx__row-meta">
      <Show when={props.workspaceLabel}>
        <span class="sx__chip">{props.workspaceLabel}</span>
      </Show>
      <Show when={props.model}>
        <span class="sx__chip sx__chip--soft">{props.model}</span>
      </Show>
      <Show when={typeof props.costUsd === 'number' && props.costUsd > 0}>
        <span class="sx__chip sx__chip--soft">${formatSessionCost(props.costUsd!)}</span>
      </Show>
    </div>
  );
}
