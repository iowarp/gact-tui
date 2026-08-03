/**
 * Add-remote-backend route shell: hosts the wizard form and drives the
 * controller. Exports the {@link AddRemoteBackend} screen component.
 */
import { createSignal, onMount } from 'solid-js';
import { registerWindowKeydown } from '../domListeners.js';
import { useBackendRegistry } from '../registry.js';
import { inTauri, openSshTunnel } from '../tauri.js';
import { AddRemoteBackendForm } from './AddRemoteBackendForm.js';
import {
  DEFAULT_HTTP_BACKEND_URL,
  DEFAULT_SSH_REMOTE_PORT,
  validateAddRemoteBackendValues,
  type AddRemoteBackendValues,
  type RemoteBackendMode,
} from './AddRemoteBackendModel.js';
import { saveRemoteBackend } from './AddRemoteBackendController.js';
import './settings.css';

export interface AddRemoteBackendProps {
  onSaved: (id: string) => void;
  onCancel: () => void;
}

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
  const [mode, setMode] = createSignal<RemoteBackendMode>('http');

  const [label, setLabel] = createSignal('');
  const [url, setUrl] = createSignal(DEFAULT_HTTP_BACKEND_URL);
  const [token, setToken] = createSignal('');

  const [sshHost, setSshHost] = createSignal('');
  const [sshUser, setSshUser] = createSignal('');
  const [sshKey, setSshKey] = createSignal('');
  const [sshRemotePort, setSshRemotePort] = createSignal(DEFAULT_SSH_REMOTE_PORT);

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
    registerWindowKeydown(onKey, true);
  });

  async function save() {
    setError(null);
    const values: AddRemoteBackendValues = {
      mode: mode(),
      label: label(),
      url: url(),
      token: token(),
      sshHost: sshHost(),
      sshUser: sshUser(),
      sshKey: sshKey(),
      sshRemotePort: sshRemotePort(),
    };
    const validationError = validateAddRemoteBackendValues(values);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const { id } = await saveRemoteBackend(values, reg, {
        isDesktop: inTauri,
        openTunnel: openSshTunnel,
      });
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
        <AddRemoteBackendForm
          mode={mode}
          setMode={setMode}
          label={label}
          setLabel={setLabel}
          url={url}
          setUrl={setUrl}
          token={token}
          setToken={setToken}
          sshHost={sshHost}
          setSshHost={setSshHost}
          sshUser={sshUser}
          setSshUser={setSshUser}
          sshKey={sshKey}
          setSshKey={setSshKey}
          sshRemotePort={sshRemotePort}
          setSshRemotePort={setSshRemotePort}
          submitting={submitting}
          error={error}
          onCancel={props.onCancel}
          onSave={() => void save()}
        />
      </main>
    </div>
  );
}
