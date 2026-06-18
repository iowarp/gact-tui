import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { brand } from '@brand';
import { useBackendRegistry } from '../registry.js';
import { Client, type BackendEntry } from '@clio/core';
import { getRequestLocale } from '../locale.js';
import { inTauri, openSshTunnel, tauriFetch } from '../tauri.js';
import './settings.css';

export interface AddRemoteBackendProps {
  onSaved: (id: string) => void;
  onCancel: () => void;
}

type Mode = 'http' | 'ssh';

/**
 * /settings/backends/add-remote — the form that USED to be the front
 * door is now a deep settings page. URL + bearer for the HTTP path is
 * always available; SSH tunnelling is desktop-only and grays out in
 * the pure-web build (with a hint to install CLIO Desktop).
 *
 * Desktop can open an `ssh -L` tunnel through the Tauri shell; the web build
 * keeps the form visible as a portable config surface but cannot spawn ssh.
 */
export function AddRemoteBackend(props: AddRemoteBackendProps) {
  const reg = useBackendRegistry();
  const [mode, setMode] = createSignal<Mode>('http');

  const [label, setLabel] = createSignal('');
  const [url, setUrl] = createSignal('http://localhost:17800');
  const [token, setToken] = createSignal('');

  const [sshHost, setSshHost] = createSignal('');
  const [sshUser, setSshUser] = createSignal('');
  const [sshKey, setSshKey] = createSignal('');
  const [sshRemotePort, setSshRemotePort] = createSignal('17800');

  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Esc cancels.
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    onCleanup(() => window.removeEventListener('keydown', onKey, true));
  });

  async function save() {
    setError(null);
    if (!label().trim()) {
      setError('Pick a label so the picker shows something useful.');
      return;
    }
    if (mode() === 'http' && !url().trim()) {
      setError('URL is required for HTTP backends.');
      return;
    }
    const parsedRemotePort = Number.parseInt(sshRemotePort().trim(), 10);
    if (mode() === 'ssh' && (!sshHost().trim() || !sshUser().trim())) {
      setError('SSH host and user are required.');
      return;
    }
    if (mode() === 'ssh' && (!Number.isFinite(parsedRemotePort) || parsedRemotePort <= 0)) {
      setError('Remote port must be a positive number.');
      return;
    }

    setSubmitting(true);
    try {
      const id = mode() + ':' + cryptoRandomId();
      let tunneledUrl = 'http://127.0.0.1:0';
      let tunneledPort: number | undefined;
      if (mode() === 'ssh' && inTauri()) {
        const tunnel = await openSshTunnel({
          host: sshHost().trim(),
          user: sshUser().trim(),
          remote_port: parsedRemotePort,
          key_path: sshKey().trim(),
        });
        tunneledUrl = tunnel.local_url;
        tunneledPort = tunnel.local_port;
      }
      const entry: BackendEntry = {
        id,
        label: label().trim(),
        url: mode() === 'http' ? url().trim().replace(/\/+$/, '') : tunneledUrl,
        bearerToken: token().trim(),
        kind: mode() === 'http' ? 'http' : 'ssh-tunnel',
        ssh:
          mode() === 'ssh'
            ? {
                host: sshHost().trim(),
                user: sshUser().trim(),
                keyPath: sshKey().trim(),
                ...(tunneledPort ? { localPort: tunneledPort } : {}),
              }
            : undefined,
      };
      reg.add(entry);
      reg.select(id);

      if (entry.kind === 'http' || (entry.kind === 'ssh-tunnel' && inTauri())) {
        // Best-effort capability probe before handing off — gives the
        // user immediate feedback (capabilities chip turns green).
        try {
          const c = new Client({
            baseUrl: entry.url,
            bearerToken: entry.bearerToken,
            fetch: inTauri() ? tauriFetch : undefined,
            getLocale: getRequestLocale,
          });
          const caps = await c.capabilities();
          reg.update(id, { capabilities: caps });
        } catch (e) {
          reg.update(id, {
            lastError: e instanceof Error ? e.message : String(e),
          });
        }
      }

      props.onSaved(id);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div class="settings" data-testid="settings-add-remote-page">
      <header class="settings__topbar">
        <button
          type="button"
          class="settings__back"
          onClick={props.onCancel}
          data-testid="add-remote-cancel"
        >
          ← Back
        </button>
        <div class="settings__title">
          <span class="eyebrow">settings · backends</span>
          <h1>Add remote backend</h1>
        </div>
        <div />
      </header>

      <main class="settings__body settings__body--remote">
        <div class="card settings__form settings__form--remote">
          <div class="settings__seg">
            <button
              type="button"
              class={'settings__seg-btn ' + (mode() === 'http' ? 'is-active' : '')}
              onClick={() => setMode('http')}
              data-testid="add-remote-mode-http"
            >
              HTTP (URL + bearer)
            </button>
            <button
              type="button"
              class={'settings__seg-btn ' + (mode() === 'ssh' ? 'is-active' : '')}
              onClick={() => setMode('ssh')}
              data-testid="add-remote-mode-ssh"
              title={!inTauri() ? `This stores SSH backend config. ${brand.name} Desktop can open the tunnel.` : undefined}
            >
              SSH tunnel
              <Show when={!inTauri()}>
                <span class="chip chip--warn">desktop only</span>
              </Show>
            </button>
          </div>

          <div class="field">
            <label for="add-label">Label</label>
            <input
              id="add-label"
              type="text"
              value={label()}
              onInput={(e) => setLabel(e.currentTarget.value)}
              placeholder="e.g. ALCF · polaris"
              data-testid="add-remote-label"
            />
          </div>

          <Show when={mode() === 'http'}>
            <div class="field">
              <label for="add-url">Backend URL</label>
              <input
                id="add-url"
                type="url"
                value={url()}
                onInput={(e) => setUrl(e.currentTarget.value)}
                data-testid="add-remote-url"
              />
            </div>
            <div class="field">
              <label for="add-token">Bearer token</label>
              <input
                id="add-token"
                type="password"
                value={token()}
                onInput={(e) => setToken(e.currentTarget.value)}
                placeholder="paste a bearer token from the remote backend"
                data-testid="add-remote-token"
              />
            </div>
          </Show>

          <Show when={mode() === 'ssh'}>
            <div class="field">
              <label for="ssh-host">SSH host</label>
              <input
                id="ssh-host"
                type="text"
                value={sshHost()}
                onInput={(e) => setSshHost(e.currentTarget.value)}
                placeholder="polaris.alcf.anl.gov"
                data-testid="add-remote-ssh-host"
              />
            </div>
            <div class="field">
              <label for="ssh-user">User</label>
              <input
                id="ssh-user"
                type="text"
                value={sshUser()}
                onInput={(e) => setSshUser(e.currentTarget.value)}
                data-testid="add-remote-ssh-user"
              />
            </div>
            <div class="field">
              <label for="ssh-key">Private key path</label>
              <input
                id="ssh-key"
                type="text"
                value={sshKey()}
                onInput={(e) => setSshKey(e.currentTarget.value)}
                placeholder="~/.ssh/id_ed25519"
                data-testid="add-remote-ssh-key"
              />
            </div>
            <div class="field">
              <label for="ssh-port">Remote backend port</label>
              <input
                id="ssh-port"
                type="number"
                min="1"
                max="65535"
                value={sshRemotePort()}
                onInput={(e) => setSshRemotePort(e.currentTarget.value)}
                data-testid="add-remote-ssh-port"
              />
            </div>
            <div class="field">
              <label for="ssh-token">Bearer token</label>
              <input
                id="ssh-token"
                type="password"
                value={token()}
                onInput={(e) => setToken(e.currentTarget.value)}
                placeholder="bearer token from the remote backend"
                data-testid="add-remote-ssh-token"
              />
            </div>
            <div class="settings__hint">
              <Show
                when={inTauri()}
                fallback={
                  <>
                    The web build stores this backend config, but cannot spawn
                    {' '}<code>ssh -L</code>. Open it from {brand.name} Desktop to
                    create the tunnel.
                  </>
                }
              >
                Desktop opens <code>ssh -L</code> to the remote backend port and
                stores the tunneled local URL on the backend entry.
              </Show>
            </div>
          </Show>

          <Show when={error()}>
            <div class="settings__error" data-testid="add-remote-error">
              {error()}
            </div>
          </Show>

          <div class="settings__actions">
            <button
              type="button"
              class="btn btn--secondary"
              onClick={props.onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn btn--primary"
              disabled={submitting()}
              onClick={() => void save()}
              data-testid="add-remote-save"
            >
              {submitting() ? 'Saving…' : 'Save backend'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint8Array(8);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).slice(2, 12);
}
