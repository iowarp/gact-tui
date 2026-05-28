import { For, Show, createMemo, createSignal } from 'solid-js';
import { Icon } from './Icon.js';
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

export interface SessionsColumnProps {
  rows: SessionRow[];
  activeId: string;
  onSelect: (id: string) => void;
  onNewSession?: () => void | Promise<void>;
  /** Optional connection / SSE status pip for the header. */
  connectionLabel?: string;
  connectionTone?: 'ok' | 'warn' | 'err' | 'idle';
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
