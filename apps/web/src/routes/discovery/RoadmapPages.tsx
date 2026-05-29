/**
 * Read-only discovery pages for the GACT v0.2 surfaces the desktop
 * doesn't yet have a write-flow for: hooks, policies, agent
 * blueprints, expert packs. Surfacing them in Settings makes them
 * discoverable (instead of users having to edit YAML on disk and
 * not knowing where to look).
 */

import { createResource, createSignal, For, Show } from 'solid-js';
import type { Client } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';

export interface ClientPageProps {
  client: Client;
}

/** Hooks: pre/post-message + pre/post-tool handlers. Read + add + delete. */
export function HooksPage(props: ClientPageProps) {
  const [data, { refetch }] = createResource(() =>
    props.client.hooks().catch(() => ({ hooks: [] })),
  );
  const items = () => data()?.hooks ?? [];

  const [hType, setHType] = createSignal<'pre_message' | 'post_message' | 'pre_tool' | 'post_tool'>(
    'pre_message',
  );
  const [hUri, setHUri] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function submitNew(ev: SubmitEvent) {
    ev.preventDefault();
    const uri = hUri().trim();
    if (!uri || busy()) return;
    setBusy(true);
    setError(null);
    try {
      await props.client.createHook({ type: hType(), handler_uri: uri });
      setHUri('');
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeHook(id: string) {
    try {
      await props.client.deleteHook(id);
      void refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <DiscoveryPage
      icon="tool"
      title="Hooks"
      subtitle="Registered pre / post handlers for messages and tools. Add an HTTP URI and the backend will POST every turn payload to it."
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
      empty={!data.loading && items().length === 0 && !error()}
      emptyTitle="No hooks registered"
      emptyBody="Hooks are external HTTP / stdio handlers the backend POSTs to on every turn. Add one below."
    >
      <ul class="rmp__list" data-testid="hooks-list">
        <For each={items()}>
          {(h) => (
            <li class="rmp__row" data-testid={`hook-${h.id}`}>
              <span class={'rmp__tag rmp__tag--' + h.type}>{h.type}</span>
              <span class="rmp__name">{h.id}</span>
              <code class="rmp__uri">{h.handler_uri}</code>
              <button
                type="button"
                class="rmp__row-x"
                title="Delete hook"
                aria-label={`Delete hook ${h.id}`}
                onClick={() => void removeHook(h.id)}
                data-testid={`hook-delete-${h.id}`}
              >
                <Icon name="close" size={10} />
              </button>
            </li>
          )}
        </For>
      </ul>
      <form class="rmp__form" onSubmit={submitNew} data-testid="hook-form">
        <select
          class="rmp__form-select"
          value={hType()}
          onChange={(e) =>
            setHType(
              e.currentTarget.value as
                | 'pre_message'
                | 'post_message'
                | 'pre_tool'
                | 'post_tool',
            )
          }
          data-testid="hook-type"
        >
          <option value="pre_message">pre_message</option>
          <option value="post_message">post_message</option>
          <option value="pre_tool">pre_tool</option>
          <option value="post_tool">post_tool</option>
        </select>
        <input
          class="rmp__form-input"
          type="url"
          placeholder="http://localhost:9999/hook"
          value={hUri()}
          onInput={(e) => setHUri(e.currentTarget.value)}
          data-testid="hook-uri"
        />
        <button
          type="submit"
          class="rmp__form-add"
          disabled={busy() || !hUri().trim()}
          data-testid="hook-add"
        >
          <Icon name="plus" size={12} />
          <span>{busy() ? 'Adding…' : 'Add'}</span>
        </button>
      </form>
      <Show when={error()}>
        <p class="rmp__form-err">{error()}</p>
      </Show>
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
