/**
 * Mode toggle (HTTP vs SSH tunnel) for the add-remote-backend form.
 */
import { Show, type Accessor, type Setter } from 'solid-js';
import { brand } from '@brand';
import { inTauri } from '../tauri.js';
import type { RemoteBackendMode } from './AddRemoteBackendModel.js';

export function AddRemoteBackendModeSelector(props: {
  mode: Accessor<RemoteBackendMode>;
  setMode: Setter<RemoteBackendMode>;
}) {
  return (
    <div class="settings__seg">
      <button
        type="button"
        class={'settings__seg-btn ' + (props.mode() === 'http' ? 'is-active' : '')}
        onClick={() => props.setMode('http')}
        data-testid="add-remote-mode-http"
      >
        HTTP (URL + bearer)
      </button>
      <button
        type="button"
        class={'settings__seg-btn ' + (props.mode() === 'ssh' ? 'is-active' : '')}
        onClick={() => props.setMode('ssh')}
        data-testid="add-remote-mode-ssh"
        title={
          !inTauri()
            ? `This stores SSH backend config. ${brand.name} Desktop can open the tunnel.`
            : undefined
        }
      >
        SSH tunnel
        <Show when={!inTauri()}>
          <span class="chip chip--warn">desktop only</span>
        </Show>
      </button>
    </div>
  );
}
