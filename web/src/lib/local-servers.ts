import type { LanguageModelPreset, ProviderHandshake } from '@clio/core/v3';
import { plural, t } from '@lingui/core/macro';

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
 * address the service reports over HTTP, needing no key or sign-in
 * (LM Studio, Ollama, llama.cpp, vLLM). Derived from the preset's own data,
 * never a list of names.
 */
export function isLocalServerPreset(preset: LanguageModelPreset): boolean {
  return (
    !preset.requires_api_key &&
    (preset.auth_method ?? 'none') === 'none' &&
    Boolean(preset.api_base && /^https?:\/\//iu.test(preset.api_base))
  );
}

/** An address as typed, made a URL a check can use ("localhost:1234" -> "http://localhost:1234/v1"). */
export function normalizeServerAddress(typed: string, defaultPath = '/v1'): string | undefined {
  const text = typed.trim();
  if (!text) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//iu.test(text) ? text : `http://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (url.pathname === '/' || url.pathname === '') url.pathname = defaultPath;
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
        ? plural(models.length, {
            one: 'Running, with # model.',
            other: 'Running, with # models.',
          })
        : t`Running, but no model is loaded yet.`,
    };
  }
  return {
    reachable: false,
    models: [],
    sentence:
      result.connectivity === 'timeout'
        ? t`Nothing answered at this address in time.`
        : t`Nothing is running at this address.`,
  };
}

export type ServerStatus =
  | { kind: 'running'; models: number }
  | { kind: 'stopped' }
  | { kind: 'unknown' };

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
  if (latest)
    return latest.reachable
      ? { kind: 'running', models: latest.models.length }
      : { kind: 'stopped' };
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
  if (!check) return t`It has not been checked yet.`;
  if (!check.reachable) return t`Nothing is running at its address right now.`;
  const count = check.models.length;
  return count
    ? plural(count, { one: 'It is running, with # model.', other: 'It is running, with # models.' })
    : t`It is running, but no model is loaded yet.`;
}

/** "http://localhost:11434/v1" as "localhost:11434"; a non-standard path stays. */
export function shortServerAddress(address: string): string {
  try {
    const url = new URL(address);
    const path = url.pathname.replace(/\/$/u, '');
    return `${url.host}${path === '' || path === '/v1' ? '' : path}`;
  } catch {
    return address;
  }
}

/**
 * A server's status in words for its row and details. A stopped server on
 * this computer is a grey "Not running", never an error; one elsewhere that
 * does not answer is "Can't reach".
 */
export function serverStatusWords(
  status: ServerStatus,
  address: string,
  label: string,
): { tone: 'success' | 'idle' | 'inactive' | 'error'; label: string; hint?: string } {
  if (status.kind === 'running') return { tone: 'success', label: t`Running` };
  if (status.kind === 'unknown') return { tone: 'idle', label: t`Not checked yet` };
  if (isLoopbackAddress(address))
    return {
      tone: 'inactive',
      label: t`Not running`,
      hint: t`Start ${label} and load a model, then check again.`,
    };
  return { tone: 'error', label: t`Can’t reach`, hint: t`No answer at this address.` };
}
