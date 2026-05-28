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
              <li>
                <button
                  type="button"
                  class={
                    'sx__row ' + (row.id === props.activeId ? 'is-active' : '')
                  }
                  data-testid={`session-row-${row.id}`}
                  onClick={() => props.onSelect(row.id)}
                >
                  <span class={'sx__pip sx__pip--' + pipClass(row.status)} />
                  <div class="sx__row-main">
                    <div class="sx__row-title-row">
                      <span class="sx__row-title">{row.title}</span>
                      <span class="sx__row-when">{row.updatedAt}</span>
                    </div>
                    <Show when={row.preview}>
                      <p class="sx__row-preview">{row.preview}</p>
                    </Show>
                    <div class="sx__row-meta">
                      <Show when={row.workspace}>
                        <span class="sx__chip">{row.workspace}</span>
                      </Show>
                      <Show when={row.model}>
                        <span class="sx__chip sx__chip--soft">{row.model}</span>
                      </Show>
                      <Show when={typeof row.costUsd === 'number' && row.costUsd! > 0}>
                        <span class="sx__chip sx__chip--soft">
                          ${row.costUsd!.toFixed(3)}
                        </span>
                      </Show>
                    </div>
                  </div>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </aside>
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
