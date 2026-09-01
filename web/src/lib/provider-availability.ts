import type { LanguageModelPreset, ProviderDefinition } from '@clio/core/v3';

export interface ProviderAvailability {
  label: string;
  value: 'healthy' | 'degraded' | 'unavailable';
  detail?: string;
}

function providerName(preset: LanguageModelPreset | undefined): string {
  return preset?.label.replace(/\s*\([^)]*\)\s*$/u, '') || 'this provider';
}

/** Translate service configuration diagnostics into useful product language. */
export function providerStatusDetail(
  preset: LanguageModelPreset | undefined,
  fallback?: string,
): string | undefined {
  const detail = preset?.status_message || fallback;
  if (!detail) return undefined;
  if (/^missing\s+[A-Z0-9_]+_API_KEY$/u.test(detail)) {
    return `Connect ${providerName(preset)} to use this provider.`;
  }
  if (/stored Globus token could not be refreshed/iu.test(detail)) {
    return 'Sign in to your ALCF account again.';
  }
  if (/(?:CLI|command).*(?:not found|not installed)|not found on PATH/iu.test(detail)) {
    return `${providerName(preset)} is not installed on the connected agent.`;
  }
  return detail;
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
      detail: providerStatusDetail(preset, 'Run a provider check to verify availability.'),
    };
  }
  if (preset?.status === 'unavailable') {
    return {
      label: 'Unavailable',
      value: 'unavailable',
      detail: providerStatusDetail(preset),
    };
  }
  if (preset && ['auth_required', 'missing_key'].includes(preset.status ?? '')) {
    return {
      label: 'Sign-in needed',
      value: 'unavailable',
      detail: providerStatusDetail(preset),
    };
  }
  if (preset?.is_authenticated) return { label: 'Ready', value: 'healthy' };
  if (preset) {
    return {
      label: 'Sign-in needed',
      value: 'unavailable',
      detail: providerStatusDetail(preset),
    };
  }
  return provider?.is_authenticated
    ? { label: 'Ready', value: 'healthy' }
    : { label: 'Sign-in needed', value: 'unavailable' };
}
