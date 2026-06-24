/**
 * Discovery surface: Memory Sections component. Key export `MemorySearchSection`.
 */
import { createMemo, createResource, createSignal, Show } from 'solid-js';
import type { Client, MemorySearchResult } from '@clio/core';
import { Icon } from '../../components/Icon.js';
import { createDebouncedText } from '../../debouncedText.js';
import { MemoryEventsList } from './MemoryEventsList.js';
import { MemorySearchResults } from './MemorySearchResults.js';
import type { MemoryEventRow } from './MemorySectionsModel.js';
import './memory-sections.css';

export { humanWhen, memoryEventTypeTone } from './MemorySectionsModel.js';
export type { MemoryEventRow };

export function MemorySearchSection(props: { client: Client }) {
  const query = createDebouncedText();

  const searchKey = createMemo(() => {
    const q = query.debounced();
    return q.length >= 2 ? q : null;
  });
  const [searchData] = createResource(
    () => searchKey(),
    async (q): Promise<MemorySearchResult | null> => {
      if (!q) return null;
      try {
        return await props.client.memorySearch(q, { limit: 50 });
      } catch {
        return { query: q, hits: [] };
      }
    },
  );

  return (
    <>
      <div class="mem__search">
        <Icon name="search" size={13} />
        <input
          type="search"
          class="mem__search-input"
          placeholder="Search every session in this workspace…"
          value={query.raw()}
          onInput={(e) => query.set(e.currentTarget.value)}
          data-testid="memory-search-input"
        />
        <Show when={query.raw()}>
          <button
            type="button"
            class="mem__search-clear"
            onClick={query.reset}
            aria-label="Clear search"
          >
            <Icon name="close" size={11} />
          </button>
        </Show>
      </div>
      <Show when={searchKey()}>
        <MemorySearchResults loading={searchData.loading} result={searchData()} />
      </Show>
    </>
  );
}

export function MemoryEventsSection(props: { activeSessionId?: string; events: MemoryEventRow[] }) {
  const [showEvents, setShowEvents] = createSignal(true);

  return (
    <Show when={props.activeSessionId}>
      <button
        type="button"
        class="mem__events-toggle"
        onClick={() => setShowEvents((v) => !v)}
        data-testid="memory-events-toggle"
      >
        <Icon
          name="chevron-right"
          size={11}
          class={'mem__events-chev ' + (showEvents() ? 'is-open' : '')}
        />
        <span>
          Events for current session
          <Show when={props.events.length > 0}>{' '}({props.events.length})</Show>
        </span>
      </button>
      <Show when={showEvents()}>
        <MemoryEventsList events={props.events} />
      </Show>
    </Show>
  );
}
