/**
 * Read-only discovery pages for the GACT v0.2 surfaces the desktop
 * doesn't yet have a write-flow for: hooks, policies, agent
 * blueprints, expert packs. Surfacing them in Settings makes them
 * discoverable (instead of users having to edit YAML on disk and
 * not knowing where to look).
 */

import { createResource, For, Show } from 'solid-js';
import type { Client } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';

export interface ClientPageProps {
  client: Client;
}

/** Hooks: pre/post-message + pre/post-tool handlers. */
export function HooksPage(props: ClientPageProps) {
  const [data, { refetch }] = createResource(() =>
    props.client.hooks().catch(() => ({ hooks: [] })),
  );
  const items = () => data()?.hooks ?? [];
  return (
    <DiscoveryPage
      icon="tool"
      title="Hooks"
      subtitle="Registered pre / post handlers for messages and tools. Read-only — install/remove via the backend's hook config."
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
      empty={!data.loading && items().length === 0}
      emptyTitle="No hooks registered"
      emptyBody="Hooks are external HTTP / stdio handlers the backend POSTs to on every turn. Set them up in clio-agent's hook config."
    >
      <ul class="rmp__list" data-testid="hooks-list">
        <For each={items()}>
          {(h) => (
            <li class="rmp__row" data-testid={`hook-${h.id}`}>
              <span class={'rmp__tag rmp__tag--' + h.type}>{h.type}</span>
              <span class="rmp__name">{h.id}</span>
              <code class="rmp__uri">{h.handler_uri}</code>
            </li>
          )}
        </For>
      </ul>
    </DiscoveryPage>
  );
}

/** Policies: tool / command / memory autonomy gates. */
export function PoliciesPage(props: ClientPageProps) {
  const [data, { refetch }] = createResource(() =>
    props.client.policies().catch(() => null),
  );
  const policies = () => data()?.policies ?? {};
  const entries = () => Object.entries(policies()) as Array<[string, unknown]>;
  return (
    <DiscoveryPage
      icon="agents"
      title="Policies"
      subtitle="Workspace + global autonomy policy that gates tools, commands, and memory access. Read-only here."
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
      empty={!data.loading && entries().length === 0}
      emptyTitle="No policy returned"
      emptyBody="Backend exposes /v1/policies but no entries are configured."
    >
      <div class="rmp__pretty">
        <pre>{JSON.stringify(policies(), null, 2)}</pre>
      </div>
    </DiscoveryPage>
  );
}

/** Agent blueprints (#386 / #387). */
export function BlueprintsPage(props: ClientPageProps) {
  const [data, { refetch }] = createResource(() =>
    props.client.agentBlueprints().catch(() => ({ blueprints: [] })),
  );
  const items = () => data()?.blueprints ?? [];
  return (
    <DiscoveryPage
      icon="agents"
      title="Agent blueprints"
      subtitle="DSPy + MCP descriptor bundles the orchestrator can route into. Add via clio-agent's blueprint install path."
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
      empty={!data.loading && items().length === 0}
      emptyTitle="No blueprints registered"
      emptyBody="Drop a blueprint YAML into clio-agent/src/clio_agent/blueprints/ or POST /v1/agent-blueprints/install."
    >
      <div class="dp__grid">
        <For each={items()}>
          {(bp) => (
            <article class="dp__card" data-testid={`blueprint-${bp.id}`}>
              <header class="dp__card-head">
                <div class="dp__card-title-row">
                  <div class="dp__card-icon">
                    <Icon name="agents" size={14} />
                  </div>
                  <div style="min-width:0">
                    <h3 class="dp__card-title">{bp.name ?? bp.id}</h3>
                    <div class="dp__card-sub">{bp.id}</div>
                  </div>
                </div>
              </header>
              <Show when={bp.description}>
                <p class="dp__card-body">{bp.description}</p>
              </Show>
            </article>
          )}
        </For>
      </div>
    </DiscoveryPage>
  );
}

/** Expert packs (#344 / #376 / #377). */
export function ExpertPacksPage(props: ClientPageProps) {
  const [data, { refetch }] = createResource(() =>
    props.client.expertPacks().catch(() => ({ packs: [] })),
  );
  const items = () => data()?.packs ?? [];
  return (
    <DiscoveryPage
      icon="sparkle"
      title="Expert packs"
      subtitle="Hierarchical prompt + skill bundles that bind to a workspace, session, or single turn."
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
      empty={!data.loading && items().length === 0}
      emptyTitle="No expert packs installed"
      emptyBody="Drop a pack under clio-agent/src/clio_agent/experts/ or use the expert-packs install path."
    >
      <div class="dp__grid">
        <For each={items()}>
          {(p) => (
            <article class="dp__card" data-testid={`expertpack-${p.id}`}>
              <header class="dp__card-head">
                <div class="dp__card-title-row">
                  <div class="dp__card-icon">
                    <Icon name="sparkle" size={14} />
                  </div>
                  <div style="min-width:0">
                    <h3 class="dp__card-title">{p.name ?? p.id}</h3>
                    <div class="dp__card-sub">{p.id}</div>
                  </div>
                </div>
                <Show when={p.runtime_scope}>
                  <span class="dp__tag">{p.runtime_scope}</span>
                </Show>
              </header>
              <Show when={p.description}>
                <p class="dp__card-body">{p.description}</p>
              </Show>
            </article>
          )}
        </For>
      </div>
    </DiscoveryPage>
  );
}
