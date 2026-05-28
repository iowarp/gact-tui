import { createSignal } from 'solid-js';
import type { BackendHandle } from '../App.js';
import './connect.css';

export interface ConnectScreenProps {
  onConnected: (b: BackendHandle) => void;
}

export function ConnectScreen(props: ConnectScreenProps) {
  const [url, setUrl] = createSignal('http://localhost:7777');
  const [token, setToken] = createSignal('');
  const [status, setStatus] = createSignal<'idle' | 'connecting' | 'error'>('idle');
  const [error, setError] = createSignal<string | null>(null);

  async function tryConnect() {
    setStatus('connecting');
    setError(null);
    try {
      // For the harness build we don't yet drive the live wire — the visual
      // proof and PLAN.md item #2 handle that. If a backend is reachable, we
      // still attempt /v1/capabilities so the connect button does real work
      // against the gact-tui emulator.
      const res = await fetch(`${url().replace(/\/+$/, '')}/v1/capabilities`, {
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

  return (
    <div class="connect">
      <div class="atmos-orb atmos-orb--warm" />
      <div class="atmos-orb atmos-orb--cool" />
      <div class="atmos-noise" />

      <main class="connect__main" data-testid="connect-screen">
        <div class="connect__wordmark">CLIO</div>
        <div class="eyebrow connect__sub">Federated Agentic Coder · GACT v0.2</div>

        <div class="card connect__card">
          <div class="eyebrow">Connect to backend</div>
          <h1 class="connect__h1">Add a CLIO endpoint</h1>
          <p class="connect__lede">
            Point this client at any GACT-conforming backend. SSH-tunneled multi-backend
            and managed installs live in the desktop app.
          </p>

          <div class="field">
            <label for="conn-url">Backend URL</label>
            <input
              id="conn-url"
              type="url"
              value={url()}
              onInput={(e) => setUrl(e.currentTarget.value)}
              placeholder="http://localhost:7777"
              data-testid="connect-url"
            />
          </div>

          <div class="field">
            <label for="conn-token">Bearer token (optional)</label>
            <input
              id="conn-token"
              type="password"
              value={token()}
              onInput={(e) => setToken(e.currentTarget.value)}
              placeholder="paste a token issued by clio-agent token issue …"
              data-testid="connect-token"
            />
          </div>

          {error() && (
            <div class="connect__error" data-testid="connect-error">
              {error()}
            </div>
          )}

          <div class="connect__actions">
            <button
              type="button"
              class="btn btn--primary"
              onClick={tryConnect}
              disabled={status() === 'connecting'}
              data-testid="connect-submit"
            >
              {status() === 'connecting' ? 'Connecting…' : 'Connect →'}
            </button>
            <span class="eyebrow">no telemetry · stays on this box</span>
          </div>
        </div>

        <footer class="connect__footer">
          <span class="chip chip--ok">desktop primary</span>
          <span class="chip">web alongside</span>
          <span class="chip chip--warn">harness build</span>
        </footer>
      </main>
    </div>
  );
}
