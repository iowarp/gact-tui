/**
 * Action factory for the in-chat model/provider controls (switch model,
 * permission mode). Exports {@link createChatModelControls}.
 */
import { createEffect, createMemo, createResource, createSignal, type Accessor } from 'solid-js';
import type { Client } from '@clio/core';
import type { ModelOption, ModelProviderOption, PermissionMode } from '../components/ComposerTypes.js';
import { providersToModelProviders, providersToModels } from './chatScreenUtils.js';

export interface ChatModelControlsOptions {
  activeId: Accessor<string>;
  client: Client;
}

export function createChatModelControls(options: ChatModelControlsOptions) {
  const [providersData] = createResource(() => options.client.providers());
  const [lmActive] = createResource(() => options.client.lmConfig().catch(() => null));
  const models = createMemo<ModelOption[]>(() => {
    const providers = providersData()?.providers ?? [];
    const list = providersToModels(providers);
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
    mergeActiveLmProvider(providersToModelProviders(providersData()?.providers ?? []), lmActive()),
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
    return providers;
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
