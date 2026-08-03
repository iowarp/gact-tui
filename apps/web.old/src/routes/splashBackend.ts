/**
 * Probes/creates the splash-screen backend handle, including the pure-web
 * backend probe. Exports {@link probePureWebBackend} and {@link createSplashBackendHandle}.
 */
import type { Capabilities } from '@clio/core';
import type { BackendRegistryState } from '@clio/core';
import { Client } from '@clio/core';
import { brand } from '@brand';
import type { BackendHandle } from '../App.js';
import { getRequestLocale } from '../locale.js';
import { inTauri, tauriFetch } from '../tauri.js';
import { PURE_WEB_DEFAULT_BACKEND, PURE_WEB_PROBE_TIMEOUT_MS } from './splashModel.js';
import {
  bearerAuthHeaders,
  capabilitiesEndpoint,
  isCapabilitiesPayload,
  normalizedBackendBaseUrl,
} from './ConnectScreenModel.js';

export interface PureWebBackendCandidate {
  url: string;
  token: string;
}

export interface PureWebBackendProbeResult {
  url: string;
  token: string;
  capabilities: Capabilities;
}

export interface SplashBackendProbeOptions {
  baseUrl?: string;
  candidates?: readonly PureWebBackendCandidate[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function probePureWebBackend(
  options: SplashBackendProbeOptions = {},
): Promise<PureWebBackendProbeResult | null> {
  const candidates = options.candidates ?? [
    { url: options.baseUrl ?? PURE_WEB_DEFAULT_BACKEND, token: '' },
  ];
  const timeoutMs = options.timeoutMs ?? PURE_WEB_PROBE_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  for (const candidate of candidates) {
    const normalized = normalizedBackendBaseUrl(candidate.url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(capabilitiesEndpoint(normalized), {
        headers: bearerAuthHeaders(candidate.token),
        signal: ctrl.signal,
      });
      if (!res.ok) continue;
      const caps = await res.json();
      if (isCapabilitiesPayload(caps)) {
        return { url: normalized, token: candidate.token, capabilities: caps as Capabilities };
      }
    } catch {
      // Try the next candidate.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export function pureWebBackendCandidates(
  state: BackendRegistryState,
  attachPort = brand.backend.attachPort || 17800,
): PureWebBackendCandidate[] {
  const candidates: PureWebBackendCandidate[] = [];
  const current = state.currentId
    ? state.backends.find((backend) => backend.id === state.currentId)
    : state.backends[0];
  if (current) candidates.push({ url: current.url, token: current.bearerToken });
  for (const backend of state.backends) {
    if (backend.id === current?.id) continue;
    candidates.push({ url: backend.url, token: backend.bearerToken });
  }
  candidates.push(
    { url: `http://127.0.0.1:${attachPort}`, token: '' },
    { url: `http://localhost:${attachPort}`, token: '' },
  );
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${normalizedBackendBaseUrl(candidate.url)}\n${candidate.token}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function createSplashBackendHandle(
  url: string,
  token: string,
  probedCapabilities?: Capabilities,
): Promise<BackendHandle> {
  if (probedCapabilities) return { url, bearerToken: token, capabilities: probedCapabilities };
  const client = new Client({
    baseUrl: url,
    bearerToken: token || undefined,
    // Route through the Rust gact_http command when running inside Tauri; the
    // WebView's CORS layer blocks direct fetches to sidecars without CORS.
    fetch: inTauri() ? tauriFetch : undefined,
    getLocale: getRequestLocale,
  });
  const capabilities: Capabilities = await client.capabilities();
  return { url, bearerToken: token, capabilities };
}
