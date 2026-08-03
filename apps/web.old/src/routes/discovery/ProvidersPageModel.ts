/**
 * View-model / pure logic for Providers Page: state shaping and helpers, no DOM. Key export `ProviderLmInput`.
 */
import type { ProviderDef } from '@clio/core';

export interface ProviderLmInput {
  provider: string;
  api_base: string;
  model: string;
}

export function filterProviders(providers: ProviderDef[], query: string): ProviderDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return providers;
  return providers.filter(
    (provider) =>
      provider.id.toLowerCase().includes(q) ||
      provider.name.toLowerCase().includes(q) ||
      (provider.description ?? '').toLowerCase().includes(q),
  );
}

export function providerLmInput(provider: ProviderDef): ProviderLmInput {
  return {
    provider: provider.id,
    api_base: provider.api_base ?? '',
    model:
      provider.default_model && provider.default_model.length > 0
        ? provider.default_model
        : 'unknown',
  };
}
