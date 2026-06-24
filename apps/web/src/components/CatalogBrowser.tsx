/**
 * UI component: Catalog Browser. Renders `CatalogBrowser` from `CatalogBrowserProps`.
 */
import { For, Show, createResource, createSignal, onMount } from 'solid-js';
import type { Client } from '@clio/core';
import { registerWindowKeydown } from '../domListeners.js';
import { trapFocusRef } from '../focus-trap.js';
import { CatalogBrowserResults } from './CatalogBrowserResults.js';
import {
  catalogCategoryCounts,
  filterCatalogHits,
  groupCatalogHitsWithIndexes,
  KIND_LABEL,
  loadCatalogHits,
  type CatalogHit,
  type CatalogKind,
} from './CatalogBrowserModel.js';
import './catalog-browser.css';

export interface CatalogBrowserProps {
  open: boolean;
  client: Client;
  onClose: () => void;
  /** Called when the user picks an entry — route to the relevant
   * discovery page (or settings deep-link). */
  onPick: (target: { kind: CatalogKind; id: string; label: string }) => void;
}

/**
 * Cmd+Shift+K — unified search across agents / commands / MCP
 * servers / prompts / workspaces. Mirrors the TUI's catalog browser.
 *
 * All five resources fetch in parallel on open, are cached for the
 * lifetime of the modal, and filtered in-memory by the query box.
 */
export function CatalogBrowser(props: CatalogBrowserProps) {
  const [query, setQuery] = createSignal('');
  const [highlight, setHighlight] = createSignal(0);
  let inputRef: HTMLInputElement | undefined;

  // Single resource that fetches everything in parallel. Once.
  const [catalog] = createResource(
    () => (props.open ? props.client : null),
    async (c) => {
      if (!c) return [] as CatalogHit[];
      return loadCatalogHits(c);
    },
  );

  const filtered = () => {
    const all = catalog() ?? [];
    return filterCatalogHits(all, query());
  };

  const grouped = () => groupCatalogHitsWithIndexes(filtered());

  const categoryCounts = () => {
    const all = catalog() ?? [];
    return catalogCategoryCounts(all);
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!props.open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onClose();
        return;
      }
      const list = filtered();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => Math.min(list.length - 1, h + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => Math.max(0, h - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const pick = list[highlight()];
        if (pick) {
          props.onPick(pick);
          props.onClose();
        }
      }
    };
    registerWindowKeydown(onKey, true);
  });

  let prevOpen = false;
  const focusEffect = () => {
    if (props.open && !prevOpen) queueMicrotask(() => inputRef?.focus());
    prevOpen = props.open;
  };

  return (
    <Show when={props.open}>
      {(() => {
        focusEffect();
        return (
          <>
            <div class="cbr__backdrop" onClick={props.onClose} />
            <div
              class="cbr"
              role="dialog"
              aria-modal="true"
              aria-label="Catalog browser"
              ref={trapFocusRef}
              data-testid="catalog-browser"
            >
              <header class="cbr__head">
                <span class="eyebrow">Search agents, commands, tools, prompts, and workspaces</span>
              </header>
              <input
                ref={inputRef}
                type="text"
                class="cbr__input"
                placeholder="Filter…"
                value={query()}
                onInput={(e) => {
                  setQuery(e.currentTarget.value);
                  setHighlight(0);
                }}
                data-testid="catalog-browser-input"
              />
              <Show when={catalog.loading}>
                <div class="cbr__loading">Loading catalog…</div>
              </Show>
              <Show when={!catalog.loading}>
                <div class="cbr__summary" aria-label="Catalog category counts">
                  <For each={categoryCounts()}>
                    {(entry) => (
                      <span
                        class={'cbr__summary-chip ' + (entry.count > 0 ? 'is-live' : '')}
                        data-testid={`catalog-summary-${entry.kind}`}
                      >
                        {KIND_LABEL[entry.kind]}
                        <strong>{entry.count}</strong>
                      </span>
                    )}
                  </For>
                </div>
              </Show>
              <CatalogBrowserResults
                groups={grouped()}
                loading={catalog.loading}
                highlightedIndex={highlight()}
                onHighlight={setHighlight}
                onPick={(hit) => {
                  props.onPick(hit);
                  props.onClose();
                }}
              />
              <footer class="cbr__foot">
                <span class="chip">↑ ↓ navigate</span>
                <span class="chip">↵ open</span>
                <span class="chip">esc close</span>
              </footer>
            </div>
          </>
        );
      })()}
    </Show>
  );
}
