import type { ClioModelOption } from '@/lib/model-options';
import { modelTransportLabel } from './provider-transport-state';

/** Compact provider and model name shown by the composer picker. */
export function composerModelLabel(option: ClioModelOption): string {
  const half = modelTransportLabel(option);
  const provider = half ? `${option.providerName} · ${half}` : option.providerName;
  return `${provider} / ${compactModelName(option.providerId, option.id, option.label)}`;
}

function compactModelName(provider: string, modelId: string, label: string): string {
  if (provider === 'codex') {
    const familyName = modelId.match(/(?:^|[-_.])(luna|sol|terra)$/i)?.[1];
    if (familyName)
      return `${familyName.charAt(0).toUpperCase()}${familyName.slice(1).toLowerCase()}`;
  }
  if (provider === 'claude_code' && /sonnet/i.test(modelId)) return 'Sonnet';
  return label;
}
