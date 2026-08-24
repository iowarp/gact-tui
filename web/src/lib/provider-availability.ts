import type { LanguageModelPreset, ProviderDefinition } from '@clio/core/v3';

export interface ProviderAvailability {
  label: string;
  value: 'healthy' | 'degraded' | 'unavailable';
  detail?: string;
}

/** Prefer the live preset status over a provider's coarse authentication capability. */
export function providerAvailability(
  provider: ProviderDefinition | undefined,
  preset: LanguageModelPreset | undefined,
): ProviderAvailability {
  if (preset?.status === 'ready') return { label: 'Ready', value: 'healthy' };
  if (preset?.status === 'unknown') {
    return {
      label: 'Not checked',
      value: 'degraded',
      detail: preset.status_message || 'Run a provider check to verify availability.',
    };
  }
  if (preset?.status === 'unavailable') {
    return {
      label: 'Unavailable',
      value: 'unavailable',
      detail: preset.status_message,
    };
  }
  if (preset && ['auth_required', 'missing_key'].includes(preset.status ?? '')) {
    return {
      label: 'Sign-in needed',
      value: 'unavailable',
      detail: preset.status_message,
    };
  }
  if (preset?.is_authenticated) return { label: 'Ready', value: 'healthy' };
  if (preset) {
    return {
      label: 'Sign-in needed',
      value: 'unavailable',
      detail: preset.status_message,
    };
  }
  return provider?.is_authenticated
    ? { label: 'Ready', value: 'healthy' }
    : { label: 'Sign-in needed', value: 'unavailable' };
}
