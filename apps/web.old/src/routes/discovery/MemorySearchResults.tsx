/**
 * Discovery surface: Memory Search Results component. Key export `MemorySearchResults`.
 */
import { For, Show } from 'solid-js';
import type { MemorySearchResult } from '@clio/core';
import { formatScore } from '../../formatters.js';

export function MemorySearchResults(props: {
  loading: boolean;
  result: MemorySearchResult | null | undefined;
}) {
  const hits = () => props.result?.hits ?? [];

  return (
    <div class="mem__search-results" data-testid="memory-search-results">
      <Show when={props.loading}>
        <div class="mem__search-status">Searching…</div>
      </Show>
      <Show when={!props.loading && props.result && hits().length === 0}>
        <div class="mem__search-status">No hits.</div>
      </Show>
      <Show when={!props.loading && hits().length > 0}>
        <ul class="mem__search-list">
          <For each={hits()}>
            {(h) => (
              <li class="mem__search-hit" data-testid={`memory-search-hit-${h.message_id}`}>
                <div class="mem__search-hit-meta">
                  <Show when={h.role}>
                    <span class="mem__search-hit-role">{h.role}</span>
                  </Show>
                  <span class="mem__search-hit-session">session {h.session_id.slice(0, 8)}</span>
                  <Show when={typeof h.score === 'number'}>
                    <span class="mem__search-hit-score">{formatScore(h.score!)}</span>
                  </Show>
                </div>
                <div class="mem__search-hit-text">{h.text}</div>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
