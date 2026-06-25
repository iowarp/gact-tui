import { createEffect, createSignal, Show } from 'solid-js';
import { brand } from '@brand';
import type { BackendHandle } from '../App.js';
import { Icon } from '../components/Icon.js';
import { BrandMark } from '../components/BrandMark.js';
import { inTauri, tauriFetch } from '../tauri.js';
import './connect.css';

export interface ConnectScreenProps {
  onConnected: (b: BackendHandle) => void;
}

/**
 * True when `u` points at a non-loopback host — i.e. a REMOTE / federated
 * backend (bearer-token or SSH-tunnelled), not the bundled local clio.
 * Reauth affordances are scoped strictly to these: the local clio's LM
 * token is maintained externally and must never surface a "re-auth" path.
 */
function isRemoteBackend(u: string): boolean {
  let host: string;
  try {
    host = new URL(u).hostname.toLowerCase();
  } catch {
    return false;
  }
  return !(
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]'
  );
}

export function ConnectScreen(props: ConnectScreenProps) {
  const [url, setUrl] = createSignal('http://127.0.0.1:17800');
  const [token, setToken] = createSignal('');
  const [status, setStatus] = createSignal<'idle' | 'connecting' | 'error'>('idle');
  const [error, setError] = createSignal<string | null>(null);
  // True only when a REMOTE backend rejected the request with 401/403 — the
  // one case where re-entering bearer/SSH credentials is the fix. Drives the
  // "Re-enter credentials" affordance. Never set for a local backend.
  const [reauthNeeded, setReauthNeeded] = createSignal(false);
  // Bearer token lives behind an "Advanced" disclosure: the localhost
  // trust-socket happy path needs no token, so novices never see
  // "bearer token" / "trust_socket". It auto-opens when a credential is
  // actually required (auth failure / remote reauth).
  const [showAdvanced, setShowAdvanced] = createSignal(false);

  let tokenInputEl: HTMLInputElement | undefined;

  // A remote (non-loopback) URL almost always needs a bearer token, so reveal
  // Advanced automatically once the user points at one. localhost keeps the
  // happy path (no token field). We only ever OPEN it here — the user can
  // still collapse it manually for a remote that trusts its socket.
  createEffect(() => {
    if (isRemoteBackend(url())) setShowAdvanced(true);
  });

  async function tryConnect() {
    setStatus('connecting');
    setError(null);
    setReauthNeeded(false);
    try {
      const fetchImpl = inTauri() ? tauriFetch : globalThis.fetch;
      const res = await fetchImpl(`${url().replace(/\/+$/, '')}/v1/capabilities`, {
        headers: token() ? { Authorization: `Bearer ${token()}` } : {},
      });
      if (!res.ok) {
        // Remote-backend auth failure → offer a credentials re-entry path
        // instead of a generic HTTP error. Scoped to remote hosts only.
        if ((res.status === 401 || res.status === 403) && isRemoteBackend(url())) {
          setReauthNeeded(true);
        }
        // An auth failure means a token IS needed — reveal the field.
        if (res.status === 401 || res.status === 403) {
          setShowAdvanced(true);
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const caps = await res.json();
      props.onConnected({ url: url(), bearerToken: token(), capabilities: caps });
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /** Clear the stale token and focus the field so the user can paste a
   * fresh credential, then they press Connect again. */
  function reenterCredentials() {
    setToken('');
    setReauthNeeded(false);
    setStatus('idle');
    setShowAdvanced(true);
    queueMicrotask(() => tokenInputEl?.focus());
  }

  // Actionable hint derived from the failure shape — tells the user what to
  // try next instead of leaving a bare HTTP code / network error.
  const errorHint = () => {
    const msg = error();
    if (!msg) return null;
    if (/401|403/.test(msg)) return 'The backend rejected the credentials — paste a token from `clio-agent token issue`.';
    if (/404/.test(msg)) return 'That URL responded but is not a GACT backend — check the port.';
    if (/HTTP \d/.test(msg)) return 'The backend answered with an error — check its logs, then press Connect to retry.';
    return `Nothing answered at that URL — is the local backend running? Start ${brand.name}'s backend, then press Connect to retry.`;
  };

  return (
    <div class="connect" data-testid="connect-screen-bg">
      <main class="connect__main" data-testid="connect-screen">
        <div class="connect__brand">
          <BrandMark class="connect__mark" />
          <span class="connect__wordmark">{brand.wordmark}</span>
        </div>
        <h1 class="connect__title">Welcome to {brand.name}</h1>
        <p class="connect__lede">
          {brand.tagline ? brand.tagline + '. ' : ''}Connect to get started —
          it defaults to the local backend running on this machine.
        </p>

        <div class="connect__card">
          <div class="field">
            <label for="conn-url">Backend URL</label>
            <input
              id="conn-url"
              type="url"
              value={url()}
              onInput={(e) => setUrl(e.currentTarget.value)}
              placeholder="http://127.0.0.1:17800"
              data-testid="connect-url"
              autocomplete="off"
              spellcheck={false}
            />
          </div>

          <button
            type="button"
            class="connect__advanced-toggle"
            aria-expanded={showAdvanced()}
            onClick={() => setShowAdvanced((v) => !v)}
            data-testid="connect-advanced-toggle"
          >
            <Icon
              name="chevron-right"
              size={11}
              class={'connect__advanced-chev ' + (showAdvanced() ? 'is-open' : '')}
            />
            <span>Advanced</span>
          </button>

          <Show when={showAdvanced()}>
            <div class="field connect__advanced">
              <label for="conn-token">
                Bearer token{' '}
                <span class="connect__hint-inline">
                  (skip when the backend uses trust_socket on localhost)
                </span>
              </label>
              <input
                id="conn-token"
                ref={tokenInputEl}
                type="password"
                value={token()}
                onInput={(e) => setToken(e.currentTarget.value)}
                placeholder="paste a bearer token from your backend …"
                data-testid="connect-token"
                autocomplete="off"
                spellcheck={false}
              />
            </div>
          </Show>

          <Show when={error()}>
            <div class="connect__error" data-testid="connect-error">
              <Icon name="help" size={14} />
              <span>
                {error()}
                <span class="connect__error-hint">{errorHint()}</span>
              </span>
            </div>
          </Show>

          {/* Remote-backend auth failure: offer a credentials re-entry
              action (bearer / SSH token) instead of leaving a bare 401/403.
              Scoped to remote hosts only — the local clio's model-provider
              token is maintained externally and is never re-auth'd here. */}
          <Show when={reauthNeeded()}>
            <div class="connect__reauth" data-testid="connect-reauth">
              <span class="connect__reauth-msg">
                This remote backend rejected your credentials. Sign in again
                with a fresh token.
              </span>
              <button
                type="button"
                class="connect__reauth-btn"
                onClick={reenterCredentials}
                data-testid="splash-reauth"
              >
                Re-enter credentials
              </button>
            </div>
          </Show>

          <div class="connect__actions">
            <button
              type="button"
              class="connect__submit"
              onClick={tryConnect}
              disabled={status() === 'connecting'}
              data-testid="connect-submit"
            >
              <Show
                when={status() === 'connecting'}
                fallback={
                  <>
                    Connect
                    <Icon name="arrow-up-right" size={14} />
                  </>
                }
              >
                Connecting…
              </Show>
            </button>
            <span class="connect__privacy">no telemetry · stays on this box</span>
          </div>
        </div>
      </main>
    </div>
  );
}
