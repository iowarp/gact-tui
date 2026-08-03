/**
 * UI component: Session List Item. Renders `SessionListItem` from `SessionListItemProps`.
 */
import { Show, createSignal } from 'solid-js';
import { Icon } from './Icon.js';
import { SessionListItemMeta, SessionListItemTitle } from './SessionListItemContent.js';
import { SessionListItemMenu } from './SessionListItemMenu.js';
import type { SessionRow } from './SessionsColumnModel.js';
import {
  isFreshBump,
  sessionStatusPipClass,
  shouldCommitRename,
} from './SessionListItemModel.js';

export interface SessionListItemProps {
  row: SessionRow;
  workspaceLabel?: string;
  active: boolean;
  onSelect: () => void;
  onRename?: (nextTitle: string) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onExport?: () => void | Promise<void>;
  onShare?: () => void | Promise<void>;
  onFork?: () => void | Promise<void>;
  onTogglePin?: () => void;
}

export function SessionListItem(props: SessionListItemProps) {
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal(props.row.title);
  const [menuOpen, setMenuOpen] = createSignal(false);
  let editRef: HTMLInputElement | undefined;

  function commitRename() {
    const nextTitle = shouldCommitRename(draft(), props.row.title);
    setEditing(false);
    if (!nextTitle) return;
    void props.onRename?.(nextTitle);
  }

  function startRename() {
    setDraft(props.row.title);
    setEditing(true);
    setTimeout(() => {
      editRef?.focus();
      editRef?.select();
    });
  }

  return (
    <li>
      <div
        class={
          'sx__row ' +
          (props.active ? 'is-active ' : '') +
          (isFreshBump(props.row.bumpedAt) ? 'is-bumped' : '')
        }
        data-testid={`session-row-${props.row.id}`}
      >
        <button
          type="button"
          class="sx__row-hit"
          onClick={(e) => {
            if (editing()) return;
            const target = e.target as HTMLElement;
            if (target.closest('.sx__row-menu') || target.closest('input')) return;
            props.onSelect();
          }}
          aria-label={`Open ${props.row.title}`}
        >
          <span class={'sx__pip sx__pip--' + sessionStatusPipClass(props.row.status)} />
          <div class="sx__row-main">
            <SessionListItemTitle
              row={props.row}
              editing={editing()}
              draft={draft()}
              canRename={Boolean(props.onRename)}
              onDraft={setDraft}
              onCommitRename={commitRename}
              onCancelRename={() => setEditing(false)}
              onStartRename={startRename}
              onEditRef={(el) => {
                editRef = el;
              }}
            />
            <Show when={props.row.preview}>
              <p class="sx__row-preview">{props.row.preview}</p>
            </Show>
            <SessionListItemMeta
              workspaceLabel={props.workspaceLabel}
              model={props.row.model}
              costUsd={props.row.costUsd}
            />
          </div>
        </button>
        <Show when={props.onRename || props.onDelete}>
          <button
            type="button"
            class="sx__row-kebab"
            aria-haspopup="menu"
            aria-expanded={menuOpen()}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            data-testid={`session-row-kebab-${props.row.id}`}
          >
            <Icon name="menu" size={14} />
          </button>
        </Show>
        <SessionListItemMenu
          row={props.row}
          open={menuOpen()}
          onClose={() => setMenuOpen(false)}
          onStartRename={startRename}
          onRename={props.onRename}
          onDelete={props.onDelete}
          onExport={props.onExport}
          onShare={props.onShare}
          onFork={props.onFork}
          onTogglePin={props.onTogglePin}
        />
      </div>
    </li>
  );
}
