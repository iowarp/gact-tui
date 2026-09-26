import { useState } from 'react';
import { findSelectedModelOption, type ClioModelOption } from '@/lib/model-options';

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
  const selectedOption = findSelectedModelOption(
    modelOptions,
    selectedProvider,
    selectedModel,
    selectedTransport,
  );

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
