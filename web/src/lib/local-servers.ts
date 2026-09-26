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

export type ServerStatus = { kind: 'running'; models: number } | { kind: 'stopped' } | { kind: 'unknown' };

/**
 * A server's ONE status, as its card shows it: the latest explicit check when
 * there is one, else what discovery last found for a catalog runtime. A
 * custom server that was never checked is "unknown", never guessed stopped.
 */
export function serverStatus({
  custom,
  group,
  latest,
}: {
  custom: boolean;
  group: { health: string; availableChoices: readonly unknown[] } | undefined;
  latest: { reachable: boolean; models: readonly string[] } | undefined;
}): ServerStatus {
  if (latest) return latest.reachable ? { kind: 'running', models: latest.models.length } : { kind: 'stopped' };
  if (custom) return { kind: 'unknown' };
  if (group?.health === 'healthy' || group?.health === 'checking') {
    return { kind: 'running', models: group.availableChoices.length };
  }
  return { kind: 'stopped' };
}

/** What a saved server's latest check found, in one sentence. */
export function savedCheckSentence(
  check: { reachable: boolean; models: readonly string[] } | undefined,
): string {
  if (!check) return 'It has not been checked yet.';
  if (!check.reachable) return 'Nothing is running at its address right now.';
  const count = check.models.length;
  return count ? `It is running, with ${count} ${count === 1 ? 'model' : 'models'}.` : 'It is running, but no model is loaded yet.';
}
