/**
 * Probes/creates the splash-screen backend handle, including the pure-web
 * backend probe. Exports {@link probePureWebBackend} and {@link createSplashBackendHandle}.
 */
import type { Capabilities } from '@clio/core';
import { Client } from '@clio/core';
import type { BackendHandle } from '../App.js';
import { getRequestLocale } from '../locale.js';
import { inTauri, tauriFetch } from '../tauri.js';
import { PURE_WEB_DEFAULT_BACKEND, PURE_WEB_PROBE_TIMEOUT_MS } from './splashModel.js';

export interface SplashBackendProbeOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function probePureWebBackend(
  options: SplashBackendProbeOptions = {},
): Promise<string | null> {
  const baseUrl = options.baseUrl ?? PURE_WEB_DEFAULT_BACKEND;
  const timeoutMs = options.timeoutMs ?? PURE_WEB_PROBE_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl}/v1/capabilities`, {
      signal: ctrl.signal,
    });
    return res.ok ? baseUrl : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function createSplashBackendHandle(
  url: string,
  token: string,
): Promise<BackendHandle> {
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
