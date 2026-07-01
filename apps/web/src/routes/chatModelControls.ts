/**
 * Action factory for the in-chat model/provider controls (switch model,
 * permission mode). Exports {@link createChatModelControls}.
 */
import { createEffect, createMemo, createResource, createSignal, type Accessor } from 'solid-js';
import type { Client, ProviderDef } from '@clio/core';
import type { ModelOption, ModelProviderOption, PermissionMode } from '../components/ComposerTypes.js';
import {
  type ProviderModelCatalog,
  type ProviderModelCatalogs,
  providersToModelProviders,
  providersToModels,
} from './chatScreenUtils.js';

export interface ChatModelControlsOptions {
  activeId: Accessor<string>;
  client: Client;
}

export function createChatModelControls(options: ChatModelControlsOptions) {
  const [providersData] = createResource(() => options.client.providers());
  const [lmActive] = createResource(() => options.client.lmConfig().catch(() => null));
  const [providerCatalogs] = createResource(
    () => providersData()?.providers,
    (providers) => loadProviderModelCatalogs(options.client, providers),
  );
  const models = createMemo<ModelOption[]>(() => {
    const providers = providersData()?.providers ?? [];
    const list = providersToModels(providers, providerCatalogs() ?? {});
    const lm = lmActive();
    if (lm && lm.provider && lm.model) {
      const synthId = `${lm.provider}:${lm.model}`;
      if (!list.some((model) => model.id === synthId)) {
        list.unshift({
          id: synthId,
          providerId: lm.provider,
          providerLabel: lm.provider,
          modelId: lm.model,
        });
      }
    }
    return list;
  });
  const modelProviders = createMemo<ModelProviderOption[]>(() =>
    mergeActiveLmProvider(
      providersToModelProviders(providersData()?.providers ?? [], providerCatalogs() ?? {}),
      lmActive(),
    ),
  );

  const [selectedModelId, setSelectedModelId] = createSignal<string>('');
  const selectedModel = createMemo(() =>
    models().find((model) => model.id === selectedModelId()),
  );
  const [userPickedModel, setUserPickedModel] = createSignal(false);
  createEffect(() => {
    if (userPickedModel()) return;
    const lm = lmActive();
    if (lm && lm.provider && lm.model) {
      const synthId = `${lm.provider}:${lm.model}`;
      if (selectedModelId() !== synthId) setSelectedModelId(synthId);
      return;
    }
    if (lmActive.loading) return;
    if (selectedModelId()) setSelectedModelId('');
  });

  async function pickModel(model: ModelOption) {
    setUserPickedModel(true);
    setSelectedModelId(model.id);
    const id = options.activeId();
    if (!id) return;
    try {
      await options.client.patchSession(id, {
        model: { provider_id: model.providerId, model_id: model.modelId },
      });
    } catch (error) {
      console.error('patchSession(model) failed', error);
    }
  }

  const [permMode, setPermMode] = createSignal<PermissionMode>('ask');
  async function pickPermMode(mode: PermissionMode) {
    setPermMode(mode);
    const id = options.activeId();
    if (!id) return;
    try {
      await options.client.patchSession(id, { agent: { mode } });
    } catch (error) {
      console.error('patchSession(agent.mode) failed', error);
    }
  }

  return {
    models,
    modelProviders,
    selectedModelId,
    selectedModel,
    pickModel,
    permMode,
    pickPermMode,
  };
}

async function loadProviderModelCatalogs(
  client: Client,
  providers: ProviderDef[] | undefined,
): Promise<ProviderModelCatalogs> {
  if (!providers?.length) return {};
  const entries = await Promise.all(
    providers.map(async (provider) => {
      try {
        const result = await client.providerModels(provider.id, provider.api_base);
        const models = Array.isArray(result.models)
          ? result.models
              .filter((model) => typeof model.id === 'string' && model.id.length > 0)
              .map((model) => ({
                id: model.id,
                name: model.name ?? model.label,
                description: model.description ?? model.error ?? undefined,
              }))
          : [];
        return [
          provider.id,
          {
            models,
            source: result.source,
            error: result.error,
          } satisfies ProviderModelCatalog,
        ] as const;
      } catch (error) {
        console.warn('providerModels failed', provider.id, error);
        return [
          provider.id,
          {
            models: [],
            source: 'unavailable',
            error: error instanceof Error ? error.message : 'Provider model catalog unavailable',
          } satisfies ProviderModelCatalog,
        ] as const;
      }
    }),
  );
  return Object.fromEntries(
    entries.filter(([, catalog]) => catalog.models.length > 0 || catalog.error || catalog.source === 'unavailable'),
  );
}

export interface ActiveLmSelection {
  provider?: string;
  model?: string;
}

export function mergeActiveLmProvider(
  providers: ModelProviderOption[],
  lm: ActiveLmSelection | null | undefined,
): ModelProviderOption[] {
  if (!lm?.provider || !lm.model) return providers;
  const modelId = `${lm.provider}:${lm.model}`;
  const provider = providers.find((item) => item.id === lm.provider);
  if (provider) {
    if (!provider.models.some((model) => model.id === modelId)) {
      provider.models.unshift({
        id: modelId,
        providerId: lm.provider,
        providerLabel: provider.label,
        modelId: lm.model,
        description: 'active model',
        disabled: provider.disabled,
      });
    }
    return [provider, ...providers.filter((item) => item.id !== provider.id)];
  }
  providers.unshift({
    id: lm.provider,
    label: lm.provider,
    status: 'ok',
    statusLabel: 'ok',
    models: [
      {
        id: modelId,
        providerId: lm.provider,
        providerLabel: lm.provider,
        modelId: lm.model,
        description: 'active model',
      },
    ],
  });
  return providers;
}
