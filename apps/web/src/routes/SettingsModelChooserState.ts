/**
 * Solid state container for the model chooser: owns selection/busy/error
 * signals and the resource wiring around the pure ModelChooser model helpers.
 */
import { createEffect, createResource, createSignal } from 'solid-js';
import type { LmPreset } from '@clio/core';
import { runAsyncAction } from '../asyncAction.js';
import {
  blockedReasonForPreset,
  chooseInitialPresetId,
  defaultSelectedModel,
  findPresetById,
  isActiveModelSelection,
  mergeLiveModelOptions,
  providerModelOptions,
  suggestedModelOptions,
  type ModelOption,
} from './SettingsModelChooserModel.js';
import type { SettingsModelChooserProps } from './SettingsModelChooserTypes.js';

export function createSettingsModelChooserState(props: SettingsModelChooserProps) {
  const [selectedId, setSelectedId] = createSignal<string>('');
  const [selectedModel, setSelectedModel] = createSignal<string>('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [authMsg, setAuthMsg] = createSignal<string | null>(null);

  createEffect(() => {
    const list = props.presets();
    if (list.length === 0 || selectedId()) return;
    setSelectedId(chooseInitialPresetId(list, props.activeProvider()));
  });

  const selected = (): LmPreset | undefined => findPresetById(props.presets(), selectedId());

  const [models] = createResource(
    () => {
      const p = selected();
      if (!p) return null;
      return { id: p.id, live: p.supports_live_catalog === true };
    },
    async (arg) => {
      if (!arg) return [] as ModelOption[];
      const p = props.presets().find((x) => x.id === arg.id);
      const suggested = suggestedModelOptions(p);
      if (!p?.is_authenticated) return [] as ModelOption[];
      if (!arg.live) return suggested;
      try {
        const res = await props.client.providerModels(arg.id);
        return mergeLiveModelOptions(p, providerModelOptions(res.models ?? []));
      } catch {
        return suggested;
      }
    },
  );

  createEffect(() => {
    const list = models();
    const p = selected();
    if (!list || list.length === 0) {
      setSelectedModel('');
      return;
    }
    setSelectedModel(defaultSelectedModel(list, p));
  });

  const isActiveSelection = () =>
    isActiveModelSelection(
      selected(),
      props.activeProvider(),
      props.activeModel(),
      selectedModel(),
    );

  const blockedReason = (): string | null => blockedReasonForPreset(selected());

  async function applySelection() {
    const p = selected();
    if (!p) return;
    await runAsyncAction(
      async () => {
        await props.client.setLm({
          provider: p.id,
          api_base: p.api_base ?? '',
          model: selectedModel() || p.suggested_model || 'unknown',
        });
        await props.onChanged();
      },
      { setBusy, setError },
    );
  }

  async function authenticate() {
    const p = selected();
    if (!p) return;
    await authenticatePreset(p.id);
  }

  async function authenticatePreset(id: string) {
    const p = findPresetById(props.presets(), id);
    if (!p) return;
    setSelectedId(p.id);
    await runAsyncAction(
      async () => {
        const resp = await props.client.authProvider(p.id);
        if (!resp.is_authenticated && resp.instructions) {
          setAuthMsg(resp.instructions);
        } else if (resp.is_authenticated) {
          setAuthMsg('Signed in.');
        }
        await props.onChanged();
      },
      {
        setBusy,
        setError,
        before: () => setAuthMsg(null),
      },
    );
  }

  return {
    authMsg,
    blockedReason,
    busy,
    error,
    isActiveSelection,
    models,
    selected,
    selectedId,
    selectedModel,
    setSelectedId,
    setSelectedModel,
    applySelection,
    authenticate,
    authenticatePreset,
  };
}
