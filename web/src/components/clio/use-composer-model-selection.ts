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
  transport?: string,
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
  // Without an explicit pick, the session's own transport applies: the same model id
  // is listed under each half, and the model alone would pick the first (the wrong one).
  const selectedTransport = (current ? selection.transport : undefined) ?? transport;
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

  return { selectedOption, selectedTransport, selectModel };
}
