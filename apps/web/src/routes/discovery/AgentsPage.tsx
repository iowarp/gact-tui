import { createResource, createSignal, For, Show } from 'solid-js';
import type { AgentDef, Client } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';

export interface AgentsPageProps {
  client: Client;
}

export function AgentsPage(props: AgentsPageProps) {
  const [data, { refetch }] = createResource(() => props.client.agents());
  const [query, setQuery] = createSignal('');
  const agents = () => data()?.agents ?? [];
  const filtered = () => {
    const q = query().trim().toLowerCase();
    if (!q) return agents();
    return agents().filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        (a.description ?? '').toLowerCase().includes(q) ||
        (a.keywords ?? []).some((k) => k.toLowerCase().includes(q)),
    );
  };
  const sorted = () =>
    [...filtered()].sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99));

  return (
    <DiscoveryPage
      icon="agents"
      title="Agents"
      subtitle="Multi-tier orchestrator + specialists. Click an agent for routing details."
      actions={
        <button
          type="button"
          class="dp-iconbtn"
          onClick={() => refetch()}
          title="Refresh"
          data-testid="agents-refresh"
        >
          <Icon name="regenerate" size={14} />
        </button>
      }
      loading={data.loading}
      error={data.error ? String((data.error as Error).message ?? data.error) : null}
      empty={!data.loading && agents().length === 0}
      emptyTitle="No agents registered"
      emptyBody="Your backend reports zero agents — capability gating likely hides the tier-2 specialists."
    >
      <Show when={agents().length > 4}>
        <div class="dp__search-row">
          <Icon name="search" size={14} class="dp__search-icon" />
          <input
            type="text"
            class="dp__search-input"
            placeholder="Filter agents by name, id, or keyword…"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            data-testid="agents-search"
          />
        </div>
      </Show>
      <div class="dp__grid">
        <For each={sorted()}>{(a) => <AgentCard agent={a} />}</For>
      </div>
    </DiscoveryPage>
  );
}

function AgentCard(props: { agent: AgentDef }) {
  const tier = () => props.agent.tier ?? null;
  return (
    <article class="dp__card" data-testid={`agent-card-${props.agent.id}`}>
      <header class="dp__card-head">
        <div class="dp__card-title-row">
          <div class="dp__card-icon">
            <Icon name={tier() === 1 ? 'sparkle' : 'agents'} size={14} />
          </div>
          <div style="min-width:0">
            <h3 class="dp__card-title">{props.agent.title}</h3>
            <div class="dp__card-sub">{props.agent.id}</div>
          </div>
        </div>
        <Show when={tier() != null}>
          <span class="dp__tag dp__tag--cyan">tier {tier()}</span>
        </Show>
      </header>
      <Show when={props.agent.description}>
        <p class="dp__card-body">{props.agent.description}</p>
      </Show>
      <Show when={props.agent.tools && props.agent.tools.length > 0}>
        <div class="dp__card-tags">
          <For each={props.agent.tools!}>{(t) => <span class="dp__tag">{t}</span>}</For>
        </div>
      </Show>
      <Show when={props.agent.keywords && props.agent.keywords.length > 0}>
        <div class="dp__card-tags">
          <For each={props.agent.keywords!}>
            {(k) => <span class="dp__tag">#{k}</span>}
          </For>
        </div>
      </Show>
    </article>
  );
}
