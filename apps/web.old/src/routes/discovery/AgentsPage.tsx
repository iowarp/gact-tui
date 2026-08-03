/**
 * Discovery surface: Agents Page component. Key export `AgentsPageProps`.
 */
import { createResource, createSignal, For, Show } from 'solid-js';
import type { Client } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import { AgentCard } from './AgentCard.js';
import { filterAgents, sortAgentsByTier } from './AgentsPageModel.js';
import './agents-page.css';

export interface AgentsPageProps {
  client: Client;
}

export function AgentsPage(props: AgentsPageProps) {
  const [data, { refetch }] = createResource(() => props.client.agents());
  const [query, setQuery] = createSignal('');
  const agents = () => data()?.agents ?? [];
  const filtered = () => filterAgents(agents(), query());
  const sorted = () => sortAgentsByTier(filtered());

  return (
    <DiscoveryPage
      icon="agents"
      title="Agents"
      subtitle="Orchestrators and specialists available to the active backend."
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
      onRetry={() => void refetch()}
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
        <For each={sorted()}>
          {(a) => (
            <AgentCard
              agent={a}
              client={props.client}
              onDelete={async () => {
                if (
                  !confirm(
                    `Remove agent "${a.title ?? a.id}"? The on-disk file is preserved.`,
                  )
                )
                  return;
                try {
                  await props.client.deleteAgent(a.id);
                  void refetch();
                } catch (e) {
                  alert(
                    `Delete failed: ${e instanceof Error ? e.message : String(e)}`,
                  );
                }
              }}
            />
          )}
        </For>
      </div>
    </DiscoveryPage>
  );
}
