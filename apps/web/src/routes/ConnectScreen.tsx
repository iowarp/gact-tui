import { createSignal, Show } from 'solid-js';
import type { BackendHandle } from '../App.js';
import { Icon } from '../components/Icon.js';
import { inTauri, tauriFetch } from '../tauri.js';
import './connect.css';

export interface ConnectScreenProps {
  onConnected: (b: BackendHandle) => void;
}

export function ConnectScreen(props: ConnectScreenProps) {
  const [url, setUrl] = createSignal('http://127.0.0.1:17800');
  const [token, setToken] = createSignal('');
  const [status, setStatus] = createSignal<'idle' | 'connecting' | 'error'>('idle');
  const [error, setError] = createSignal<string | null>(null);

  async function tryConnect() {
    setStatus('connecting');
    setError(null);
    try {
      const fetchImpl = inTauri() ? tauriFetch : globalThis.fetch;
      const res = await fetchImpl(`${url().replace(/\/+$/, '')}/v1/capabilities`, {
        headers: token() ? { Authorization: `Bearer ${token()}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const caps = await res.json();
      props.onConnected({ url: url(), bearerToken: token(), capabilities: caps });
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Actionable hint derived from the failure shape — tells the user what to
  // try next instead of leaving a bare HTTP code / network error.
  const errorHint = () => {
    const msg = error();
    if (!msg) return null;
    if (/401|403/.test(msg)) return 'The backend rejected the credentials — paste a token from `clio-agent token issue`.';
    if (/404/.test(msg)) return 'That URL responded but is not a GACT backend — check the port.';
    if (/HTTP \d/.test(msg)) return 'The backend answered with an error — check its logs, then press Connect to retry.';
    return 'Nothing answered at that URL — is clio running? Start it with `clio start`, then press Connect to retry.';
  };

  return (
    <div class="connect" data-testid="connect-screen-bg">
      <main class="connect__main" data-testid="connect-screen">
        <div class="connect__badge">
          <Icon name="sparkle" size={32} />
        </div>
        <h1 class="connect__title">Connect to a CLIO backend</h1>
        <p class="connect__lede">
          Point this client at any GACT v0.2 endpoint. Defaults to the local{' '}
          <code>clio start</code> server on port 17800.
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

          <div class="field">
            <label for="conn-token">
              Bearer token{' '}
              <span class="connect__hint-inline">
                (skip when the backend uses trust_socket on localhost)
              </span>
            </label>
            <input
              id="conn-token"
              type="password"
              value={token()}
              onInput={(e) => setToken(e.currentTarget.value)}
              placeholder="paste a token issued by clio-agent token issue …"
              data-testid="connect-token"
              autocomplete="off"
              spellcheck={false}
            />
          </div>

          <Show when={error()}>
            <div class="connect__error" data-testid="connect-error">
              <Icon name="help" size={14} />
              <span>
                {error()}
                <span class="connect__error-hint">{errorHint()}</span>
              </span>
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
