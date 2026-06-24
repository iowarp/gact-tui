/**
 * Discovery surface: Providers Page component. Key export `ProvidersPageProps`.
 */
import { createResource, createSignal, For, Show } from 'solid-js';
import type { Client, ProviderDef } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import { ProviderCard } from './ProviderCard.js';
import { filterProviders, providerLmInput } from './ProvidersPageModel.js';
import './providers-detail.css';

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
      await props.client.setLm(providerLmInput(p));
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

  const [query, setQuery] = createSignal('');
  const allItems = () => providers()?.providers ?? [];
  const items = () => filterProviders(allItems(), query());
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
      onRetry={() => void refetchProviders()}
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
          <div class="dp__stat" style="background: var(--color-accent-warm-12); border-color: var(--color-select-border);">
            <div class="dp__stat-label">active LM</div>
            <div
              class="dp__stat-value"
              style="font-size: 18px; color: var(--color-accent)"
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
      <Show when={allItems().length > 4}>
        <div class="dp__search-row">
          <Icon name="search" size={14} class="dp__search-icon" />
          <input
            type="text"
            class="dp__search-input"
            placeholder="Filter providers…"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            data-testid="providers-search"
          />
        </div>
      </Show>
      <div class="dp__grid">
        <For each={items()}>
          {(p) => (
            <ProviderCard
              p={p}
              isActive={p.id === activeProviderId()}
              busy={busy() === p.id}
              client={props.client}
              onUse={() => void useAsLm(p)}
              onAuth={() => void authenticate(p)}
            />
          )}
        </For>
      </div>
    </DiscoveryPage>
  );
}
