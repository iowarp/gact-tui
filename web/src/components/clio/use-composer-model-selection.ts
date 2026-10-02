import { useState } from 'react';
import {
  findHeldModelOption,
  findSelectedModelOption,
  type ClioModelOption,
} from '@/lib/model-options';
import { useHeldProviderRecheck } from './use-held-provider-recheck';

interface ModelSelection {
  provider?: string;
  model?: string;
  authoritativeProvider?: string;
  authoritativeModel?: string;
}

/**
 * The composer's model pick: provider and model. It mirrors `provider`/`model` (the session default)
 * until the picker overrides them. Each local override is paired with the prop
 * value it was taken against ("authoritative"): while the prop still matches,
 * the override wins; once it moves (a new default, a queued-message
 * reconciliation), the fresh prop wins. This keeps attachments and other
 * composer state that a keyed remount used to discard.
 */
export function useComposerModelSelection(
  modelOptions: readonly ClioModelOption[],
  provider: string | undefined,
  model: string | undefined,
) {
  const [selection, setSelection] = useState<ModelSelection>(() => ({
    provider,
    model,
    authoritativeProvider: provider,
    authoritativeModel: model,
  }));
  const selectedProvider =
    selection.authoritativeProvider === provider ? selection.provider : provider;
  const selectedModel = selection.authoritativeModel === model ? selection.model : model;
  // A pick whose provider only needs its sign-in re-checked stays picked: the
  // service re-asks that provider when the message is sent (#1455), so stale
  // sign-in state never turns the composer back to "Choose model".
  const availableOption = findSelectedModelOption(modelOptions, selectedProvider, selectedModel);
  const heldOption = availableOption
    ? undefined
    : findHeldModelOption(modelOptions, selectedProvider, selectedModel);
  const selectedOption = availableOption ?? heldOption;
  useHeldProviderRecheck(heldOption?.providerId);

  /** Record a picker choice against the props it was taken against. */
  const selectModel = (option: ClioModelOption) =>
    setSelection({
      provider: option.providerId,
      model: option.id,
      authoritativeProvider: provider,
      authoritativeModel: model,
    });

  return { selectedOption, selectModel };
}
