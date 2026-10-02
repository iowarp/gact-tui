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
  /** The picked half of a multi-transport provider (Codex SDK / Direct). */
  transport?: string;
  authoritativeProvider?: string;
  authoritativeModel?: string;
}

/**
 * The composer's model pick: provider, model and (for a multi-transport
 * provider) transport. It mirrors `provider`/`model` (the session default)
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
  const current = selection.authoritativeModel === model;
  const selectedModel = current ? selection.model : model;
  const selectedTransport = current ? selection.transport : undefined;
  // A pick whose provider only needs its sign-in re-checked stays picked: the
  // service re-asks that provider when the message is sent (#1455), so stale
  // sign-in state never turns the composer back to "Choose model".
  const availableOption = findSelectedModelOption(
    modelOptions,
    selectedProvider,
    selectedModel,
    selectedTransport,
  );
  const heldOption = availableOption
    ? undefined
    : findHeldModelOption(modelOptions, selectedProvider, selectedModel, selectedTransport);
  const selectedOption = availableOption ?? heldOption;
  useHeldProviderRecheck(heldOption?.providerId);

  /** Record a picker choice against the props it was taken against. */
  const selectModel = (option: ClioModelOption) =>
    setSelection({
      provider: option.providerId,
      model: option.id,
      transport: option.transport,
      authoritativeProvider: provider,
      authoritativeModel: model,
    });

  // The default model can resolve to one half of a multi-transport provider
  // without a local picker action. Send the transport shown in the chip.
  return { selectedOption, selectedTransport: selectedOption?.transport ?? selectedTransport, selectModel };
}
