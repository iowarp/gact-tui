import { For, Show, createResource, createSignal, onCleanup, onMount } from 'solid-js';
import type { Client } from '@clio/core';
import { Icon, type IconName } from './Icon.js';
import { trapFocusRef } from '../focus-trap.js';
import './catalog-browser.css';

export interface CatalogBrowserProps {
  open: boolean;
  client: Client;
  onClose: () => void;
  /** Called when the user picks an entry — route to the relevant
   * discovery page (or settings deep-link). */
  onPick: (target: { kind: CatalogKind; id: string; label: string }) => void;
}

type CatalogKind = 'agent' | 'tool' | 'mcp' | 'prompt' | 'workspace';

interface CatalogHit {
  kind: CatalogKind;
  id: string;
  label: string;
  detail?: string;
}

const KIND_LABEL: Record<CatalogKind, string> = {
  agent: 'Agents',
  tool: 'Commands',
  mcp: 'MCP servers',
  prompt: 'Prompts',
  workspace: 'Workspaces',
};

const KIND_ICON: Record<CatalogKind, IconName> = {
  agent: 'agents',
  tool: 'tool',
  mcp: 'mcp',
  prompt: 'sparkle',
  workspace: 'workspaces',
};

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
      const [agentsResult, commandsResult, mcpResult, promptsResult, wsResult] =
        await Promise.allSettled([
          c.agents(),
          c.commands(),
          c.mcpServers(),
          c.prompts(),
          c.workspaces(),
        ]);
      const hits: CatalogHit[] = [];
      if (agentsResult.status === 'fulfilled') {
        for (const a of agentsResult.value.agents)
          hits.push({
            kind: 'agent',
            id: a.id,
            label: a.title ?? a.id,
            ...(a.description ? { detail: a.description } : {}),
          });
      }
      if (commandsResult.status === 'fulfilled') {
        for (const cmd of commandsResult.value.commands)
          hits.push({
            kind: 'tool',
            id: cmd.id,
            label: cmd.title ?? cmd.id,
            ...(cmd.description ? { detail: cmd.description } : {}),
          });
      }
      if (mcpResult.status === 'fulfilled') {
        for (const s of mcpResult.value.servers)
          hits.push({
            kind: 'mcp',
            id: s.id,
            label: s.name,
            detail: `${s.transport} · ${s.tools_count} tools · ${s.status}`,
          });
      }
      if (promptsResult.status === 'fulfilled') {
        for (const p of promptsResult.value.prompts)
          hits.push({
            kind: 'prompt',
            id: p.id,
            label: p.title ?? p.id,
            ...(p.description ? { detail: p.description } : {}),
          });
      }
      if (wsResult.status === 'fulfilled') {
        for (const w of wsResult.value.workspaces)
          hits.push({
            kind: 'workspace',
            id: w.id,
            label: w.name,
            detail: w.root_path,
          });
      }
      return hits;
    },
  );

  const filtered = () => {
    const q = query().trim().toLowerCase();
    const all = catalog() ?? [];
    if (!q) return all;
    return all.filter(
      (h) =>
        h.id.toLowerCase().includes(q) ||
        h.label.toLowerCase().includes(q) ||
        (h.detail ?? '').toLowerCase().includes(q),
    );
  };

  const grouped = () => {
    const out = new Map<CatalogKind, CatalogHit[]>();
    for (const h of filtered()) {
      const cur = out.get(h.kind) ?? [];
      cur.push(h);
      out.set(h.kind, cur);
    }
    return Array.from(out.entries());
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
    window.addEventListener('keydown', onKey, true);
    onCleanup(() => window.removeEventListener('keydown', onKey, true));
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
                <span class="eyebrow">Catalog · search agents · tools · MCP · prompts · workspaces</span>
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
              <ul class="cbr__list" role="listbox">
                <For each={grouped()}>
                  {([kind, hits]) => (
                    <>
                      <li class="cbr__group-head">
                        <Icon name={KIND_ICON[kind]} size={11} />
                        <span>{KIND_LABEL[kind]}</span>
                        <span class="cbr__group-count">{hits.length}</span>
                      </li>
                      <For each={hits}>
                        {(h) => {
                          const flatIdx = filtered().indexOf(h);
                          return (
                            <li
                              role="option"
                              aria-selected={flatIdx === highlight()}
                              class={
                                'cbr__item ' +
                                (flatIdx === highlight() ? 'is-active' : '')
                              }
                              onMouseEnter={() => setHighlight(flatIdx)}
                              onClick={() => {
                                props.onPick(h);
                                props.onClose();
                              }}
                              data-testid={`catalog-item-${h.kind}-${h.id}`}
                            >
                              <span class="cbr__item-label">{h.label}</span>
                              <Show when={h.detail}>
                                <span class="cbr__item-detail">{h.detail}</span>
                              </Show>
                              <span class="cbr__item-id">{h.id}</span>
                            </li>
                          );
                        }}
                      </For>
                    </>
                  )}
                </For>
                <Show when={!catalog.loading && filtered().length === 0}>
                  <li class="cbr__empty">No catalog entries match.</li>
                </Show>
              </ul>
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
