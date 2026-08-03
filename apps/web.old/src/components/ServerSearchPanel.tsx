/**
 * UI component: Server Search Panel. Renders `ServerSearchPanel` from `ServerSearchPanelProps`.
 */
import { For, Show, createResource, onMount } from 'solid-js';
import type { Client } from '@clio/core';
import { formatScore } from '../formatters.js';
import { createDebouncedText } from '../debouncedText.js';
import { Icon } from './Icon.js';
import { registerWindowKeydown } from '../domListeners.js';
import { trapFocusRef } from '../focus-trap.js';
import './server-search-panel.css';

export interface ServerSearchPanelProps {
  open: boolean;
  client: Client;
  sessionId: string;
  onJump: (messageId: string) => void;
  onClose: () => void;
}

/**
 * Cmd+Shift+F backend search — hits
 * `GET /v1/sessions/{id}/messages/search?q=…` and renders the
 * server's relevance-scored hit list as a sidebar panel. Distinct
 * from Cmd+F which does the in-page highlight on already-loaded
 * messages. Useful when the transcript has hundreds of turns and
 * the client-side scan would be slow or incomplete.
 */
export function ServerSearchPanel(props: ServerSearchPanelProps) {
  const query = createDebouncedText();
  let inputRef: HTMLInputElement | undefined;

  const [data] = createResource(
    () => (props.open && query.debounced() ? { sid: props.sessionId, q: query.debounced() } : null),
    async (key) => {
      if (!key) return { matches: [] };
      try {
        return await props.client.searchSessionMessages(key.sid, key.q);
      } catch {
        return { matches: [] };
      }
    },
  );

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!props.open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onClose();
      }
    };
    registerWindowKeydown(onKey, true);
  });

  // Focus the input on open.
  let prevOpen = false;
  const focusEffect = () => {
    if (props.open && !prevOpen) queueMicrotask(() => inputRef?.focus());
    prevOpen = props.open;
  };

  return (
    <Show when={props.open}>
      {(() => {
        focusEffect();
        const matches = () => data()?.matches ?? [];
        return (
          <aside
            class="ssp"
            role="dialog"
            aria-modal="true"
            aria-label="Backend message search"
            ref={trapFocusRef}
            data-testid="server-search-panel"
          >
            <header class="ssp__head">
              <Icon name="search" size={14} class="ssp__head-icon" />
              <input
                ref={inputRef}
                type="text"
                class="ssp__input"
                placeholder="Search the whole transcript on the server…"
                value={query.raw()}
                onInput={(e) => query.set(e.currentTarget.value)}
                data-testid="server-search-input"
              />
              <button
                type="button"
                class="ssp__close"
                onClick={props.onClose}
                aria-label="Close server search"
              >
                <Icon name="close" size={12} />
              </button>
            </header>
            <div class="ssp__meta">
              <Show when={query.debounced()}>
                <Show
                  when={!data.loading}
                  fallback={<span class="ssp__loading">searching…</span>}
                >
                  <span>{matches().length} match{matches().length === 1 ? '' : 'es'}</span>
                </Show>
              </Show>
              <Show when={!query.debounced()}>
                <span class="ssp__hint">type to search the backend index</span>
              </Show>
            </div>
            <ul class="ssp__list">
              <For each={matches()}>
                {(hit) => (
                  <li
                    class="ssp__hit"
                    data-testid={`server-search-hit-${hit.message_id}`}
                  >
                    <button
                      type="button"
                      class="ssp__hit-btn"
                      onClick={() => {
                        props.onJump(hit.message_id);
                        props.onClose();
                      }}
                    >
                      <div class="ssp__hit-snippet">{hit.snippet}</div>
                      <div class="ssp__hit-meta">
                        <span class="ssp__hit-id">{hit.message_id}</span>
                        <Show when={hit.score != null}>
                          <span class="ssp__hit-score">
                            {formatScore(hit.score! as number)}
                          </span>
                        </Show>
                      </div>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </aside>
        );
      })()}
    </Show>
  );
}
