import { createResource, For, Show } from 'solid-js';
import type { Client, ProviderDef } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';

export interface ProvidersPageProps {
  client: Client;
}

export function ProvidersPage(props: ProvidersPageProps) {
  const [data, { refetch }] = createResource(() => props.client.providers());
  const items = () => data()?.providers ?? [];
  return (
    <DiscoveryPage
      icon="sparkle"
      title="Providers"
      subtitle="LM endpoints the backend can route to. Pick one in Settings → Models."
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
      emptyTitle="No providers configured"
      emptyBody="Set CLIO_LM_PROVIDER on the backend or add a provider via Settings."
    >
      <div class="dp__grid">
        <For each={items()}>{(p) => <ProviderCard p={p} />}</For>
      </div>
    </DiscoveryPage>
  );
}

function ProviderCard(props: { p: ProviderDef }) {
  const authed = () => props.p.is_authenticated === true;
  return (
    <article class="dp__card" data-testid={`provider-card-${props.p.id}`}>
      <header class="dp__card-head">
        <div class="dp__card-title-row">
          <div class="dp__card-icon">
            <Icon name="sparkle" size={14} />
          </div>
          <div style="min-width:0">
            <h3 class="dp__card-title">{props.p.name}</h3>
            <div class="dp__card-sub">{props.p.id}</div>
          </div>
        </div>
        <span class={'dp__tag ' + (authed() ? 'dp__tag--ok' : 'dp__tag--warn')}>
          {authed() ? 'authenticated' : 'not authed'}
        </span>
      </header>
      <Show when={props.p.description}>
        <p class="dp__card-body">{props.p.description}</p>
      </Show>
      <dl class="dp__card-kv">
        <Show when={props.p.default_model}>
          <dt>default</dt>
          <dd>{props.p.default_model}</dd>
        </Show>
        <Show when={props.p.api_base}>
          <dt>endpoint</dt>
          <dd>{props.p.api_base}</dd>
        </Show>
        <Show when={props.p.auth_methods && props.p.auth_methods.length > 0}>
          <dt>auth</dt>
          <dd>{(props.p.auth_methods ?? []).join(' · ')}</dd>
        </Show>
      </dl>
    </article>
  );
}
