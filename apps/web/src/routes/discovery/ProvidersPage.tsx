import { createResource, createSignal, For, Show } from 'solid-js';
import type { Client, ProviderDef } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';

export interface ProvidersPageProps {
  client: Client;
}

export function ProvidersPage(props: ProvidersPageProps) {
  const [providers, { refetch: refetchProviders }] = createResource(() =>
    props.client.providers(),
  );
  const [lm, { refetch: refetchLm }] = createResource(() => props.client.lmConfig());
  const [busy, setBusy] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  function refreshAll() {
    void refetchProviders();
    void refetchLm();
  }

  async function useAsLm(p: ProviderDef) {
    setError(null);
    setBusy(p.id);
    try {
      const model =
        p.default_model && p.default_model.length > 0
          ? p.default_model
          : 'unknown';
      await props.client.setLm({
        provider: p.id,
        api_base: p.api_base ?? '',
        model,
      });
      void refetchLm();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function authenticate(p: ProviderDef) {
    setError(null);
    setBusy(p.id);
    try {
      const resp = await props.client.authProvider(p.id);
      // Tell the user where to complete the flow.
      if (!resp.is_authenticated && resp.instructions) {
        setError(resp.instructions);
      }
      void refetchProviders();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const items = () => providers()?.providers ?? [];
  const activeProviderId = () => lm()?.provider;

  return (
    <DiscoveryPage
      icon="sparkle"
      title="Models &amp; providers"
      subtitle="Click 'Use as LM' on a provider card to swap the agent's runtime LM."
      actions={
        <button
          type="button"
          class="dp-iconbtn"
          onClick={refreshAll}
          title="Refresh"
          data-testid="providers-refresh"
        >
          <Icon name="regenerate" size={14} />
        </button>
      }
      loading={providers.loading}
      error={
        providers.error
          ? String((providers.error as Error).message ?? providers.error)
          : null
      }
      empty={!providers.loading && items().length === 0}
      emptyTitle="No providers configured"
      emptyBody="Set CLIO_LM_PROVIDER on the backend or add a provider via Settings."
    >
      <Show when={lm()}>
        <div
          class="dp__stats"
          style="grid-template-columns: 1fr; margin-bottom: 20px"
          data-testid="providers-active"
        >
          <div class="dp__stat" style="background:color-mix(in srgb, var(--color-accent-cyan) 8%, transparent); border-color: var(--color-accent-cyan-30);">
            <div class="dp__stat-label">active LM</div>
            <div
              class="dp__stat-value"
              style="font-size: 18px; color: var(--color-accent-cyan)"
            >
              {lm()!.provider} · {lm()!.model}
            </div>
            <div class="dp__stat-sub">{lm()!.api_base}</div>
          </div>
        </div>
      </Show>
      <Show when={error()}>
        <div
          class="dp__error"
          data-testid="providers-error"
          style="margin: 0 0 20px"
        >
          <Icon name="help" size={14} />
          <span>{error()}</span>
        </div>
      </Show>
      <div class="dp__grid">
        <For each={items()}>
          {(p) => (
            <ProviderCard
              p={p}
              isActive={p.id === activeProviderId()}
              busy={busy() === p.id}
              onUse={() => void useAsLm(p)}
              onAuth={() => void authenticate(p)}
            />
          )}
        </For>
      </div>
    </DiscoveryPage>
  );
}

function ProviderCard(props: {
  p: ProviderDef;
  isActive: boolean;
  busy: boolean;
  onUse: () => void;
  onAuth: () => void;
}) {
  const authed = () => props.p.is_authenticated === true;
  const needsAuth = () => (props.p.auth_methods ?? []).some((m) => m === 'oauth');
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
        <Show
          when={props.isActive}
          fallback={
            <span
              class={'dp__tag ' + (authed() ? 'dp__tag--ok' : 'dp__tag--warn')}
            >
              {authed() ? 'authenticated' : 'not authed'}
            </span>
          }
        >
          <span class="dp__tag dp__tag--cyan">active</span>
        </Show>
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
      <div class="dp__card-actions">
        <button
          type="button"
          class="dp__card-btn dp__card-btn--primary"
          disabled={props.busy || props.isActive}
          onClick={props.onUse}
          data-testid={`provider-use-${props.p.id}`}
        >
          {props.isActive ? 'in use' : props.busy ? 'switching…' : 'Use as LM'}
        </button>
        <Show when={needsAuth()}>
          <button
            type="button"
            class="dp__card-btn"
            disabled={props.busy}
            onClick={props.onAuth}
            data-testid={`provider-auth-${props.p.id}`}
          >
            re-authenticate
          </button>
        </Show>
      </div>
    </article>
  );
}
