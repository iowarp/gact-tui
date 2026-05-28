import { createResource, createSignal, For, Show } from 'solid-js';
import type { Client, SlashCommandDef } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';

export interface ToolsPageProps {
  client: Client;
}

export function ToolsPage(props: ToolsPageProps) {
  const [data, { refetch }] = createResource(() => props.client.commands());
  const [query, setQuery] = createSignal('');
  const all = () => data()?.commands ?? [];
  const items = () => {
    const q = query().trim().toLowerCase();
    if (!q) return all();
    return all().filter(
      (c) =>
        c.id.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q),
    );
  };
  return (
    <DiscoveryPage
      icon="tools"
      title="Commands"
      subtitle="Slash commands the backend exposes. Trigger them from the composer."
      actions={
        <button
          type="button"
          class="dp-iconbtn"
          onClick={() => refetch()}
          title="Refresh"
        >
          <Icon name="regenerate" size={14} />
        </button>
      }
      loading={data.loading}
      error={data.error ? String((data.error as Error).message ?? data.error) : null}
      empty={!data.loading && items().length === 0}
      emptyTitle="No commands registered"
      emptyBody="Backend exposes no /v1/commands; the composer's slash palette falls back to defaults."
    >
      <Show when={all().length > 6}>
        <div class="dp__search-row">
          <Icon name="search" size={14} class="dp__search-icon" />
          <input
            type="text"
            class="dp__search-input"
            placeholder="Filter commands…"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            data-testid="commands-search"
          />
        </div>
      </Show>
      <div class="dp__grid">
        <For each={items()}>{(c) => <CommandCard c={c} />}</For>
      </div>
    </DiscoveryPage>
  );
}

function CommandCard(props: { c: SlashCommandDef }) {
  return (
    <article class="dp__card" data-testid={`command-card-${props.c.id}`}>
      <header class="dp__card-head">
        <div class="dp__card-title-row">
          <div class="dp__card-icon">
            <Icon name="tool" size={14} />
          </div>
          <div style="min-width:0">
            <h3 class="dp__card-title">{props.c.title}</h3>
            <div class="dp__card-sub">{props.c.id}</div>
          </div>
        </div>
        <Show when={props.c.source}>
          <span class="dp__tag">{props.c.source}</span>
        </Show>
      </header>
      <Show when={props.c.description}>
        <p class="dp__card-body">{props.c.description}</p>
      </Show>
    </article>
  );
}
