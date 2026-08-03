/**
 * Discovery surface: Provider Models Panel component. Key export `ProviderModelsPanel`.
 */
import { createSignal, For, Show } from 'solid-js';
import type { Client, ProviderDef } from '@clio/core';
import { Icon } from '../../components/Icon.js';
import './provider-models.css';

type ProviderModels = {
  models: Array<{
    id: string;
    label?: string;
    source?: 'builtin' | 'discovered' | string;
    error?: string;
    context_length?: number;
    cost_usd_per_M_tokens?: number;
  }>;
};

export function ProviderModelsPanel(props: { p: ProviderDef; client: Client }) {
  const [showModels, setShowModels] = createSignal(false);
  const [modelsData, setModelsData] = createSignal<ProviderModels | null>(null);
  const [modelsErr, setModelsErr] = createSignal<string | null>(null);
  const [modelsLoading, setModelsLoading] = createSignal(false);
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
    <>
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
    </>
  );
}
