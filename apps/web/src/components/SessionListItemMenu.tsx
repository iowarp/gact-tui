/**
 * UI component: Session List Item Menu. Renders `SessionListItemMenu` from `SessionListItemMenuProps`.
 */
import { Show } from 'solid-js';
import { Icon } from './Icon.js';
import type { SessionRow } from './SessionsColumnModel.js';

export interface SessionListItemMenuProps {
  row: SessionRow;
  open: boolean;
  onClose: () => void;
  onStartRename: () => void;
  onRename?: (nextTitle: string) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onExport?: () => void | Promise<void>;
  onShare?: () => void | Promise<void>;
  onFork?: () => void | Promise<void>;
  onTogglePin?: () => void;
}

export function SessionListItemMenu(props: SessionListItemMenuProps) {
  return (
    <Show when={props.open}>
      <div class="sx__row-menu" role="menu" onMouseLeave={props.onClose}>
        <Show when={props.onRename}>
          <button
            type="button"
            role="menuitem"
            class="sx__row-menu-item"
            onClick={() => {
              props.onClose();
              props.onStartRename();
            }}
          >
            <Icon name="edit" size={12} />
            <span>Rename</span>
          </button>
        </Show>
        <Show when={props.onTogglePin}>
          <button
            type="button"
            role="menuitem"
            class="sx__row-menu-item"
            onClick={() => {
              props.onClose();
              props.onTogglePin?.();
            }}
            data-testid={`session-row-pin-${props.row.id}`}
          >
            <Icon name="pin" size={12} />
            <span>{props.row.pinned ? 'Unpin' : 'Pin to top'}</span>
          </button>
        </Show>
        <Show when={props.onFork}>
          <button
            type="button"
            role="menuitem"
            class="sx__row-menu-item"
            onClick={() => {
              props.onClose();
              void props.onFork?.();
            }}
          >
            <Icon name="branch" size={12} />
            <span>Fork</span>
          </button>
        </Show>
        <Show when={props.onExport}>
          <button
            type="button"
            role="menuitem"
            class="sx__row-menu-item"
            onClick={() => {
              props.onClose();
              void props.onExport?.();
            }}
          >
            <Icon name="arrow-up-right" size={12} />
            <span>Export as JSON</span>
          </button>
        </Show>
        <Show when={props.onShare}>
          <button
            type="button"
            role="menuitem"
            class="sx__row-menu-item"
            onClick={() => {
              props.onClose();
              void props.onShare?.();
            }}
          >
            <Icon name="share" size={12} />
            <span>Share link</span>
          </button>
        </Show>
        <Show when={props.onDelete}>
          <button
            type="button"
            role="menuitem"
            class="sx__row-menu-item sx__row-menu-item--danger"
            onClick={() => {
              props.onClose();
              if (window.confirm(`Delete the session "${props.row.title}"? This cannot be undone.`)) {
                void props.onDelete?.();
              }
            }}
          >
            <Icon name="close" size={12} />
            <span>Delete</span>
          </button>
        </Show>
      </div>
    </Show>
  );
}
