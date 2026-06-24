/**
 * The add-remote-backend wizard form (mode selector + per-mode field sets).
 * Exports the {@link AddRemoteBackendForm} component.
 */
import { Show, type Accessor, type Setter } from 'solid-js';
import { AddRemoteBackendHttpFields } from './AddRemoteBackendHttpFields.js';
import { AddRemoteBackendModeSelector } from './AddRemoteBackendModeSelector.js';
import type { RemoteBackendMode } from './AddRemoteBackendModel.js';
import { AddRemoteBackendSshFields } from './AddRemoteBackendSshFields.js';

export interface AddRemoteBackendFormProps {
  mode: Accessor<RemoteBackendMode>;
  setMode: Setter<RemoteBackendMode>;
  label: Accessor<string>;
  setLabel: Setter<string>;
  url: Accessor<string>;
  setUrl: Setter<string>;
  token: Accessor<string>;
  setToken: Setter<string>;
  sshHost: Accessor<string>;
  setSshHost: Setter<string>;
  sshUser: Accessor<string>;
  setSshUser: Setter<string>;
  sshKey: Accessor<string>;
  setSshKey: Setter<string>;
  sshRemotePort: Accessor<string>;
  setSshRemotePort: Setter<string>;
  submitting: Accessor<boolean>;
  error: Accessor<string | null>;
  onCancel: () => void;
  onSave: () => void;
}

export function AddRemoteBackendForm(props: AddRemoteBackendFormProps) {
  return (
    <div class="card settings__form settings__form--remote">
      <AddRemoteBackendModeSelector mode={props.mode} setMode={props.setMode} />

      <div class="field">
        <label for="add-label">Label</label>
        <input
          id="add-label"
          type="text"
          value={props.label()}
          onInput={(e) => props.setLabel(e.currentTarget.value)}
          placeholder="e.g. ALCF · polaris"
          data-testid="add-remote-label"
        />
      </div>

      <Show when={props.mode() === 'http'}>
        <AddRemoteBackendHttpFields
          url={props.url}
          setUrl={props.setUrl}
          token={props.token}
          setToken={props.setToken}
        />
      </Show>

      <Show when={props.mode() === 'ssh'}>
        <AddRemoteBackendSshFields
          sshHost={props.sshHost}
          setSshHost={props.setSshHost}
          sshUser={props.sshUser}
          setSshUser={props.setSshUser}
          sshKey={props.sshKey}
          setSshKey={props.setSshKey}
          sshRemotePort={props.sshRemotePort}
          setSshRemotePort={props.setSshRemotePort}
          token={props.token}
          setToken={props.setToken}
        />
      </Show>

      <Show when={props.error()}>
        <div class="settings__error" data-testid="add-remote-error">
          {props.error()}
        </div>
      </Show>

      <div class="settings__actions">
        <button type="button" class="btn btn--secondary" onClick={props.onCancel}>
          Cancel
        </button>
        <button
          type="button"
          class="btn btn--primary"
          disabled={props.submitting()}
          onClick={() => props.onSave()}
          data-testid="add-remote-save"
        >
          {props.submitting() ? 'Saving…' : 'Save backend'}
        </button>
      </div>
    </div>
  );
}
