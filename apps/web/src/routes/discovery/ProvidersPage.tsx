import { createResource, createSignal, For, Show } from 'solid-js';
import type { Client, ProviderDef } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
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

  const [query, setQuery] = createSignal('');
  const allItems = () => providers()?.providers ?? [];
  const items = () => {
    const q = query().trim().toLowerCase();
    if (!q) return allItems();
    return allItems().filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q),
    );
  };
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

function ProviderCard(props: {
  p: ProviderDef;
  isActive: boolean;
  busy: boolean;
  client: Client;
  onUse: () => void;
  onAuth: () => void;
}) {
  const authed = () => props.p.is_authenticated === true;
  const needsAuth = () => (props.p.auth_methods ?? []).some((m) => m === 'oauth');

  // Detailed model list — only fetched on expand (avoids hammering
  // the backend for providers users aren't actively reviewing).
  const [showModels, setShowModels] = createSignal(false);
  const [modelsData, setModelsData] = createSignal<{
    models: Array<{
      id: string;
      label?: string;
      source?: 'builtin' | 'discovered' | string;
      error?: string;
      context_length?: number;
      cost_usd_per_M_tokens?: number;
    }>;
  } | null>(null);
  const [modelsErr, setModelsErr] = createSignal<string | null>(null);
  const [modelsLoading, setModelsLoading] = createSignal(false);

  // Provider single-detail metadata (GET /v1/providers/{id}). Lazy-
  // fetched alongside the model list so the card has a "Vendor /
  // status / auth" line that's richer than the bulk list.
  const [detail, setDetail] = createSignal<Awaited<
    ReturnType<Client['getProvider']>
  > | null>(null);

  async function loadModels() {
    if (modelsData() || modelsLoading()) return;
    setModelsLoading(true);
    setModelsErr(null);
    try {
      const [data, det] = await Promise.allSettled([
        props.client.providerModels(props.p.id),
        props.client.getProvider(props.p.id),
      ]);
      if (data.status === 'fulfilled') setModelsData(data.value);
      else throw data.reason;
      if (det.status === 'fulfilled') setDetail(det.value);
    } catch (e) {
      setModelsErr(e instanceof Error ? e.message : String(e));
    } finally {
      setModelsLoading(false);
    }
  }

  function toggleModels() {
    const next = !showModels();
    setShowModels(next);
    if (next) void loadModels();
  }
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
      <button
        type="button"
        class="prov__models-toggle"
        onClick={toggleModels}
        data-testid={`provider-models-toggle-${props.p.id}`}
      >
        <Icon
          name="chevron-right"
          size={11}
          class={'prov__models-chev ' + (showModels() ? 'is-open' : '')}
        />
        <span>
          {showModels() ? 'Hide' : 'Show'} models
          <Show when={modelsData()}>
            {' '}({modelsData()!.models.length})
          </Show>
        </span>
      </button>
      <Show when={showModels()}>
        <div class="prov__models" data-testid={`provider-models-${props.p.id}`}>
          <Show when={modelsLoading()}>
            <div class="prov__models-loading">Loading…</div>
          </Show>
          <Show when={detail() && !modelsLoading()}>
            <dl class="prov__detail-kv" data-testid={`provider-detail-${props.p.id}`}>
              <Show when={detail()!.vendor}>
                <dt>vendor</dt>
                <dd>{detail()!.vendor}</dd>
              </Show>
              <Show when={detail()!.status}>
                <dt>status</dt>
                <dd>{detail()!.status}</dd>
              </Show>
              <Show when={detail()!.auth?.kind}>
                <dt>auth kind</dt>
                <dd>
                  {detail()!.auth!.kind}
                  <Show when={detail()!.auth?.required}> · required</Show>
                </dd>
              </Show>
            </dl>
          </Show>
          <Show when={modelsErr()}>
            <div class="prov__models-err">{modelsErr()}</div>
          </Show>
          <Show when={modelsData() && !modelsLoading()}>
            <ul class="prov__models-list">
              <For each={modelsData()!.models}>
                {(m) => (
                  <li
                    class={
                      'prov__model ' +
                      (m.error ? 'prov__model--err' : '') +
                      (m.id === props.p.default_model ? ' prov__model--default' : '')
                    }
                    data-testid={`provider-model-${m.id}`}
                  >
                    <span class="prov__model-name">{m.label ?? m.id}</span>
                    <Show when={m.source}>
                      <span class={'prov__model-tag prov__model-tag--' + m.source}>
                        {m.source}
                      </span>
                    </Show>
                    <Show when={m.id === props.p.default_model}>
                      <span class="prov__model-tag prov__model-tag--default">default</span>
                    </Show>
                    <Show when={m.context_length}>
                      <span class="prov__model-ctx">
                        {(m.context_length! / 1000).toFixed(0)}k
                      </span>
                    </Show>
                    <Show when={m.error}>
                      <span class="prov__model-err" title={m.error}>
                        <Icon name="alert" size={11} /> error
                      </span>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </Show>
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
