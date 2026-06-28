/**
 * Action factory for the in-chat model/provider controls (switch model,
 * permission mode). Exports {@link createChatModelControls}.
 */
import { createEffect, createMemo, createResource, createSignal, type Accessor } from 'solid-js';
import type { Client } from '@clio/core';
import type { ModelOption, PermissionMode } from '../components/ComposerTypes.js';
import { providersToModels } from './chatScreenUtils.js';

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
      const synthId = `${lm.provider}/${lm.model}`;
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

  const [selectedModelId, setSelectedModelId] = createSignal<string>('');
  const [userPickedModel, setUserPickedModel] = createSignal(false);
  createEffect(() => {
    if (userPickedModel()) return;
    const lm = lmActive();
    if (lm && lm.provider && lm.model) {
      const synthId = `${lm.provider}/${lm.model}`;
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
    selectedModelId,
    pickModel,
    permMode,
    pickPermMode,
  };
}
