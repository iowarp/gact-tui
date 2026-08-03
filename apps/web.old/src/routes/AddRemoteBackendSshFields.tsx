/**
 * SSH-tunnel field set for the add-remote-backend form (host/user/port/remote).
 */
import { Show, type Accessor, type Setter } from 'solid-js';
import { brand } from '@brand';
import { inTauri } from '../tauri.js';

export function AddRemoteBackendSshFields(props: {
  sshHost: Accessor<string>;
  setSshHost: Setter<string>;
  sshUser: Accessor<string>;
  setSshUser: Setter<string>;
  sshKey: Accessor<string>;
  setSshKey: Setter<string>;
  sshRemotePort: Accessor<string>;
  setSshRemotePort: Setter<string>;
  token: Accessor<string>;
  setToken: Setter<string>;
}) {
  return (
    <>
      <div class="field">
        <label for="ssh-host">SSH host</label>
        <input
          id="ssh-host"
          type="text"
          value={props.sshHost()}
          onInput={(e) => props.setSshHost(e.currentTarget.value)}
          placeholder="polaris.alcf.anl.gov"
          data-testid="add-remote-ssh-host"
        />
      </div>
      <div class="field">
        <label for="ssh-user">User</label>
        <input
          id="ssh-user"
          type="text"
          value={props.sshUser()}
          onInput={(e) => props.setSshUser(e.currentTarget.value)}
          data-testid="add-remote-ssh-user"
        />
      </div>
      <div class="field">
        <label for="ssh-key">Private key path</label>
        <input
          id="ssh-key"
          type="text"
          value={props.sshKey()}
          onInput={(e) => props.setSshKey(e.currentTarget.value)}
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
          value={props.sshRemotePort()}
          onInput={(e) => props.setSshRemotePort(e.currentTarget.value)}
          data-testid="add-remote-ssh-port"
        />
      </div>
      <div class="field">
        <label for="ssh-token">Bearer token</label>
        <input
          id="ssh-token"
          type="password"
          value={props.token()}
          onInput={(e) => props.setToken(e.currentTarget.value)}
          placeholder="bearer token from the remote backend"
          data-testid="add-remote-ssh-token"
        />
      </div>
      <div class="settings__hint">
        <Show
          when={inTauri()}
          fallback={
            <>
              The web build stores this backend config, but cannot spawn{' '}
              <code>ssh -L</code>. Open it from {brand.name} Desktop to create
              the tunnel.
            </>
          }
        >
          Desktop opens <code>ssh -L</code> to the remote backend port and
          stores the tunneled local URL on the backend entry.
        </Show>
      </div>
    </>
  );
}
