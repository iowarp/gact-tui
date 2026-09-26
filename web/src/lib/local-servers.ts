import type { LanguageModelPreset, ProviderHandshake } from '@clio/core/v3';

/** The preset every self-hosted OpenAI-compatible server is reached through. */
export const CUSTOM_SERVER_PRESET_ID = 'vllm';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Whether an address points at this computer. */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(address).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * The providers that run on the person's own hardware: those whose service
 * address the service reports on this computer, needing no key or sign-in
 * (LM Studio, Ollama, llama.cpp, vLLM). Derived from the preset's own data,
 * never a list of names.
 */
export function isLocalServerPreset(preset: LanguageModelPreset): boolean {
  return (
    !preset.requires_api_key &&
    (preset.auth_method ?? 'none') === 'none' &&
    isLoopbackAddress(preset.api_base)
  );
}

/** An address as typed, made a URL a check can use ("localhost:1234" -> "http://localhost:1234/v1"). */
export function normalizeServerAddress(typed: string): string | undefined {
  const text = typed.trim();
  if (!text) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//iu.test(text) ? text : `http://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (url.pathname === '/' || url.pathname === '') url.pathname = '/v1';
    return url.toString().replace(/\/$/u, '');
  } catch {
    return undefined;
  }
}

export interface ServerCheck {
  reachable: boolean;
  models: string[];
  /** One plain sentence: what the check found. */
  sentence: string;
}

/** What a check of a server address found, as a person reads it. */
export function serverCheckResult(result: ProviderHandshake): ServerCheck {
  const models = result.models.map((model) => model.id);
  if (result.connectivity === 'ok') {
    return {
      reachable: true,
      models,
      sentence: models.length
        ? `Running, with ${models.length} ${models.length === 1 ? 'model' : 'models'}.`
        : 'Running, but no model is loaded yet.',
    };
  }
  return {
    reachable: false,
    models: [],
    sentence:
      result.connectivity === 'timeout'
        ? 'Nothing answered at this address in time.'
        : 'Nothing is running at this address.',
  };
}
