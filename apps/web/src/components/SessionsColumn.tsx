import { For, Show, createMemo, createSignal } from 'solid-js';
import { Icon } from './Icon.js';
// (icons used by WorkspaceSwitcher are loaded via the shared Icon.)
import type { SessionStatus } from '@clio/core';
import './sessions-column.css';

export interface SessionRow {
  id: string;
  title: string;
  status: SessionStatus;
  /** Free-text preview of the most recent message body, ≤ 90 chars. */
  preview?: string;
  /** Workspace or project label — shown as a small chip in the row. */
  workspace?: string;
  /** Humanized "2m" / "1h" / "3d". */
  updatedAt: string;
  /** Optional model badge ("opus 4.7", "gpt-oss-120b"). */
  model?: string;
  /** Per-session rolling cost in USD. */
  costUsd?: number;
}

export interface WorkspaceOption {
  id: string;
  name: string;
  rootPath?: string;
}

export interface SessionsColumnProps {
  rows: SessionRow[];
  activeId: string;
  onSelect: (id: string) => void;
  onNewSession?: () => void | Promise<void>;
  /** Optional connection / SSE status pip for the header. */
  connectionLabel?: string;
  connectionTone?: 'ok' | 'warn' | 'err' | 'idle';
  /** Available workspaces; renders a switcher when more than one. */
  workspaces?: WorkspaceOption[];
  /** Currently-selected workspace id ("__all" for unfiltered). */
  selectedWorkspaceId?: string;
  onPickWorkspace?: (id: string) => void;
  /** Per-row actions; rendered as a hover-revealed kebab menu. */
  onRenameSession?: (id: string, nextTitle: string) => void | Promise<void>;
  onDeleteSession?: (id: string) => void | Promise<void>;
  onExportSession?: (id: string) => void | Promise<void>;
  onShareSession?: (id: string) => void | Promise<void>;
  onForkSession?: (id: string) => void | Promise<void>;
}

export function SessionsColumn(props: SessionsColumnProps) {
  const [query, setQuery] = createSignal('');
  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return props.rows;
    return props.rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.preview ?? '').toLowerCase().includes(q) ||
        (r.workspace ?? '').toLowerCase().includes(q),
    );
  });

  return (
    <aside class="sx" data-testid="sessions-column" aria-label="Sessions">
      <header class="sx__head">
        <Show when={props.workspaces && props.workspaces.length > 0}>
          <WorkspaceSwitcher
            workspaces={props.workspaces!}
            selectedId={props.selectedWorkspaceId ?? '__all'}
            onPick={(id) => props.onPickWorkspace?.(id)}
          />
        </Show>
        <div class="sx__title-row">
          <h2 class="sx__title">Sessions</h2>
          <Show when={props.connectionLabel}>
            <span class={'sx__conn sx__conn--' + (props.connectionTone ?? 'idle')}>
              <span class="sx__conn-dot" />
              {props.connectionLabel}
            </span>
          </Show>
        </div>
        <div class="sx__search">
          <Icon name="search" size={14} class="sx__search-icon" />
          <input
            type="text"
            class="sx__search-input"
            placeholder="Search sessions…"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            data-testid="sessions-search"
          />
        </div>
        <button
          type="button"
          class="sx__new"
          disabled={!props.onNewSession}
          onClick={() => void props.onNewSession?.()}
          data-testid="sessions-new"
        >
          <Icon name="plus" size={14} />
          <span>New session</span>
          <span class="sx__kbd">Ctrl + N</span>
        </button>
      </header>

      <Show
        when={filtered().length > 0}
        fallback={
          <div
            class="sx__empty"
            data-testid={props.rows.length === 0 ? 'sidebar-empty' : 'sessions-empty'}
          >
            <div class="sx__empty-icon">
              <Icon name="sparkle" size={28} />
            </div>
            <p class="sx__empty-title">
              {props.rows.length === 0 ? 'No sessions yet' : 'No matches'}
            </p>
            <p class="sx__empty-body">
              {props.rows.length === 0
                ? 'Start a conversation — your sidecar is ready.'
                : 'Try a different search.'}
            </p>
          </div>
        }
      >
        <ul class="sx__list">
          <For each={filtered()}>
            {(row) => (
              <SessionListItem
                row={row}
                active={row.id === props.activeId}
                onSelect={() => props.onSelect(row.id)}
                onRename={
                  props.onRenameSession
                    ? (nextTitle) => props.onRenameSession!(row.id, nextTitle)
                    : undefined
                }
                onDelete={
                  props.onDeleteSession
                    ? () => props.onDeleteSession!(row.id)
                    : undefined
                }
                onExport={
                  props.onExportSession
                    ? () => props.onExportSession!(row.id)
                    : undefined
                }
                onShare={
                  props.onShareSession
                    ? () => props.onShareSession!(row.id)
                    : undefined
                }
                onFork={
                  props.onForkSession
                    ? () => props.onForkSession!(row.id)
                    : undefined
                }
              />
            )}
          </For>
        </ul>
      </Show>
    </aside>
  );
}

function SessionListItem(props: {
  row: SessionRow;
  active: boolean;
  onSelect: () => void;
  onRename?: (nextTitle: string) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onExport?: () => void | Promise<void>;
  onShare?: () => void | Promise<void>;
  onFork?: () => void | Promise<void>;
}) {
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal(props.row.title);
  const [menuOpen, setMenuOpen] = createSignal(false);
  let editRef: HTMLInputElement | undefined;

  function commitRename() {
    const t = draft().trim();
    setEditing(false);
    if (!t || t === props.row.title) return;
    void props.onRename?.(t);
  }

  return (
    <li>
      <div
        class={'sx__row ' + (props.active ? 'is-active' : '')}
        data-testid={`session-row-${props.row.id}`}
      >
        <button
          type="button"
          class="sx__row-hit"
          onClick={(e) => {
            if (editing()) return;
            // Don't intercept clicks on the menu / actions
            const target = e.target as HTMLElement;
            if (target.closest('.sx__row-menu') || target.closest('input')) return;
            props.onSelect();
          }}
          aria-label={`Open ${props.row.title}`}
        >
          <span class={'sx__pip sx__pip--' + pipClass(props.row.status)} />
          <div class="sx__row-main">
            <div class="sx__row-title-row">
              <Show
                when={editing()}
                fallback={
                  <span
                    class="sx__row-title"
                    ondblclick={(e) => {
                      if (!props.onRename) return;
                      e.stopPropagation();
                      e.preventDefault();
                      setDraft(props.row.title);
                      setEditing(true);
                      setTimeout(() => {
                        editRef?.focus();
                        editRef?.select();
                      });
                    }}
                  >
                    {props.row.title}
                  </span>
                }
              >
                <input
                  ref={editRef}
                  type="text"
                  class="sx__row-title-input"
                  value={draft()}
                  onClick={(e) => e.stopPropagation()}
                  onInput={(e) => setDraft(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitRename();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditing(false);
                    }
                  }}
                  onBlur={() => commitRename()}
                />
              </Show>
              <span class="sx__row-when">{props.row.updatedAt}</span>
            </div>
            <Show when={props.row.preview}>
              <p class="sx__row-preview">{props.row.preview}</p>
            </Show>
            <div class="sx__row-meta">
              <Show when={props.row.workspace}>
                <span class="sx__chip">{props.row.workspace}</span>
              </Show>
              <Show when={props.row.model}>
                <span class="sx__chip sx__chip--soft">{props.row.model}</span>
              </Show>
              <Show
                when={
                  typeof props.row.costUsd === 'number' && props.row.costUsd! > 0
                }
              >
                <span class="sx__chip sx__chip--soft">
                  ${props.row.costUsd!.toFixed(3)}
                </span>
              </Show>
            </div>
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
        <Show when={menuOpen()}>
          <div
            class="sx__row-menu"
            role="menu"
            onMouseLeave={() => setMenuOpen(false)}
          >
            <Show when={props.onRename}>
              <button
                type="button"
                role="menuitem"
                class="sx__row-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setDraft(props.row.title);
                  setEditing(true);
                  setTimeout(() => {
                    editRef?.focus();
                    editRef?.select();
                  });
                }}
              >
                <Icon name="edit" size={12} />
                <span>Rename</span>
              </button>
            </Show>
            <Show when={props.onFork}>
              <button
                type="button"
                role="menuitem"
                class="sx__row-menu-item"
                onClick={() => {
                  setMenuOpen(false);
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
                  setMenuOpen(false);
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
                  setMenuOpen(false);
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
                  setMenuOpen(false);
                  if (
                    window.confirm(
                      `Delete the session "${props.row.title}"? This cannot be undone.`,
                    )
                  ) {
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
      </div>
    </li>
  );
}

function WorkspaceSwitcher(props: {
  workspaces: WorkspaceOption[];
  selectedId: string;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const selected = () => {
    if (props.selectedId === '__all') return null;
    return props.workspaces.find((w) => w.id === props.selectedId) ?? null;
  };
  return (
    <div class="sx__ws" data-testid="workspace-switcher">
      <button
        type="button"
        class="sx__ws-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open()}
        aria-haspopup="listbox"
      >
        <Icon name="workspaces" size={12} />
        <span class="sx__ws-name">
          {selected() ? selected()!.name : 'All workspaces'}
        </span>
        <Icon name="chevron-down" size={10} />
      </button>
      <Show when={open()}>
        <div
          class="sx__ws-menu"
          role="listbox"
          onMouseLeave={() => setOpen(false)}
        >
          <button
            type="button"
            role="option"
            aria-selected={props.selectedId === '__all'}
            class={
              'sx__ws-item ' + (props.selectedId === '__all' ? 'is-active' : '')
            }
            onClick={() => {
              props.onPick('__all');
              setOpen(false);
            }}
          >
            <span>All workspaces</span>
            <Show when={props.selectedId === '__all'}>
              <Icon name="check" size={10} />
            </Show>
          </button>
          <For each={props.workspaces}>
            {(w) => (
              <button
                type="button"
                role="option"
                aria-selected={w.id === props.selectedId}
                class={
                  'sx__ws-item ' + (w.id === props.selectedId ? 'is-active' : '')
                }
                onClick={() => {
                  props.onPick(w.id);
                  setOpen(false);
                }}
              >
                <div>
                  <div class="sx__ws-item-name">{w.name}</div>
                  <Show when={w.rootPath}>
                    <div class="sx__ws-item-path">{w.rootPath}</div>
                  </Show>
                </div>
                <Show when={w.id === props.selectedId}>
                  <Icon name="check" size={10} />
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function pipClass(s: SessionStatus): string {
  switch (s) {
    case 'running':
      return 'running';
    case 'waiting_permission':
      return 'waiting';
    case 'error':
      return 'error';
    case 'finished':
      return 'finished';
    default:
      return 'idle';
  }
}
