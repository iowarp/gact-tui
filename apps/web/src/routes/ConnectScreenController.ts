/**
 * Controller for the connect screen: validates backend URLs/tokens, probes the
 * backend, and persists the chosen connection.
 */
import { createEffect, createSignal, type Accessor, type Setter } from 'solid-js';
import { brand } from '@brand';
import type { BackendHandle } from '../App.js';
import { inTauri, tauriFetch } from '../tauri.js';
import {
  DEFAULT_CONNECT_URL,
  bearerAuthHeaders,
  capabilitiesEndpoint,
  connectErrorHint,
  connectErrorMessage,
  connectFailureStateForStatus,
  isRemoteBackendUrl,
} from './ConnectScreenModel.js';

export type ConnectStatus = 'idle' | 'connecting' | 'error';
export type ConnectFetch = typeof globalThis.fetch;

export interface ConnectAttemptOptions {
  url: string;
  token: string;
  fetchImpl: ConnectFetch;
}

export interface ConnectAttemptResult {
  backend?: BackendHandle;
  error?: string;
  reauthNeeded: boolean;
  revealAdvanced: boolean;
}

export async function attemptConnect(
  options: ConnectAttemptOptions,
): Promise<ConnectAttemptResult> {
  try {
    const res = await options.fetchImpl(capabilitiesEndpoint(options.url), {
      headers: bearerAuthHeaders(options.token),
    });
    if (!res.ok) {
      const failure = connectFailureStateForStatus(res.status, options.url);
      throw Object.assign(new Error(failure.error), { failure });
    }
    const caps = await res.json();
    return {
      backend: { url: options.url, bearerToken: options.token, capabilities: caps },
      reauthNeeded: false,
      revealAdvanced: false,
    };
  } catch (e) {
    const failure = (e as { failure?: ConnectAttemptResult }).failure;
    return {
      error: connectErrorMessage(e),
      reauthNeeded: failure?.reauthNeeded ?? false,
      revealAdvanced: failure?.revealAdvanced ?? false,
    };
  }
}

export interface ConnectScreenControllerOptions {
  onConnected: (backend: BackendHandle) => void;
}

export interface ConnectScreenController {
  url: Accessor<string>;
  setUrl: Setter<string>;
  token: Accessor<string>;
  setToken: Setter<string>;
  status: Accessor<ConnectStatus>;
  error: Accessor<string | null>;
  reauthNeeded: Accessor<boolean>;
  showAdvanced: Accessor<boolean>;
  setShowAdvanced: Setter<boolean>;
  errorHint: Accessor<string | null>;
  setTokenInputRef: (el: HTMLInputElement) => void;
  tryConnect: () => Promise<void>;
  reenterCredentials: () => void;
}

export function createConnectScreenController(
  options: ConnectScreenControllerOptions,
): ConnectScreenController {
  const [url, setUrl] = createSignal(DEFAULT_CONNECT_URL);
  const [token, setToken] = createSignal('');
  const [status, setStatus] = createSignal<ConnectStatus>('idle');
  const [error, setError] = createSignal<string | null>(null);
  const [reauthNeeded, setReauthNeeded] = createSignal(false);
  const [showAdvanced, setShowAdvanced] = createSignal(false);
  let tokenInputEl: HTMLInputElement | undefined;

  createEffect(() => {
    if (isRemoteBackendUrl(url())) setShowAdvanced(true);
  });

  function setTokenInputRef(el: HTMLInputElement) {
    tokenInputEl = el;
  }

  async function tryConnect() {
    setStatus('connecting');
    setError(null);
    setReauthNeeded(false);
    const fetchImpl = inTauri()
      ? tauriFetch
      : (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init);
    const result = await attemptConnect({ url: url(), token: token(), fetchImpl });
    if (result.backend) {
      setStatus('idle');
      options.onConnected(result.backend);
      return;
    }
    if (result.revealAdvanced) setShowAdvanced(true);
    setReauthNeeded(result.reauthNeeded);
    setStatus('error');
    setError(result.error ?? 'Connection failed');
  }

  function reenterCredentials() {
    setToken('');
    setReauthNeeded(false);
    setStatus('idle');
    setShowAdvanced(true);
    queueMicrotask(() => tokenInputEl?.focus());
  }

  const errorHint = () => connectErrorHint(error(), brand.name);

  return {
    url,
    setUrl,
    token,
    setToken,
    status,
    error,
    reauthNeeded,
    showAdvanced,
    setShowAdvanced,
    errorHint,
    setTokenInputRef,
    tryConnect,
    reenterCredentials,
  };
}
