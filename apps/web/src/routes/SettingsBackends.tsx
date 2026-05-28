import { For, Show } from 'solid-js';
import { useBackendRegistry } from '../registry.js';
import type { BackendEntry } from '@clio/core';
import './settings.css';

export interface SettingsBackendsProps {
  onAddRemote: () => void;
  onBack: () => void;
}

/**
 * /settings/backends — list registered backends, refresh capabilities,
 * remove, or open the add-remote wizard. Wave 2 lands the URL+token
 * path; the SSH-tunnel section is wired to render the form (Wave 3
 * adds the real `ssh -L` spawn on desktop).
 */
export function SettingsBackends(props: SettingsBackendsProps) {
  const reg = useBackendRegistry();

  return (
    <div class="settings" data-testid="settings-backends">
      <header class="settings__topbar">
        <button
          type="button"
          class="settings__back"
          onClick={props.onBack}
          data-testid="settings-back"
        >
          ← Back
        </button>
        <div class="settings__title">
          <span class="eyebrow">settings</span>
          <h1>Backends</h1>
        </div>
        <button
          type="button"
          class="btn btn--primary"
          onClick={props.onAddRemote}
          data-testid="settings-add-remote"
        >
          + Add remote backend
        </button>
      </header>

      <main class="settings__body">
        <Show
          when={reg.state().backends.length > 0}
          fallback={
            <div class="settings__empty">
              <p>No backends registered yet.</p>
              <p>
                The bundled <code>clio-agent-gact</code> sidecar registers
                itself on first launch; additional backends (remote ALCF,
                SSH-tunneled, etc.) can be added with{' '}
                <strong>Add remote backend</strong>.
              </p>
            </div>
          }
        >
          <ul class="settings__list">
            <For each={reg.state().backends}>
              {(b) => <BackendRow entry={b} />}
            </For>
          </ul>
        </Show>
      </main>
    </div>
  );
}

function BackendRow(props: { entry: BackendEntry }) {
  const reg = useBackendRegistry();
  const status = () => {
    if (props.entry.lastError) return { label: 'error', cls: 'chip--err' };
    if (props.entry.capabilities) return { label: 'ready', cls: 'chip--ok' };
    return { label: 'unknown', cls: 'chip--warn' };
  };

  return (
    <li class="settings__row" data-testid={`settings-row-${props.entry.id}`}>
      <div class="settings__row-main">
        <div class="settings__row-head">
          <span class={'chip ' + status().cls}>{status().label}</span>
          <strong>{props.entry.label}</strong>
          <span class="chip">{props.entry.kind}</span>
          <Show when={reg.current()?.id === props.entry.id}>
            <span class="chip chip--ok">current</span>
          </Show>
        </div>
        <div class="settings__row-meta">{props.entry.url}</div>
        <Show when={props.entry.lastError}>
          <div class="settings__row-error">{props.entry.lastError}</div>
        </Show>
        <Show when={props.entry.capabilities}>
          <div class="settings__row-caps">
            contract {props.entry.capabilities?.contract_version}
            <Show when={props.entry.capabilities?.sse}> · sse</Show>
            <Show when={props.entry.capabilities?.permissions}> · permissions</Show>
            <Show when={props.entry.capabilities?.diffs}> · diffs</Show>
            <Show when={props.entry.capabilities?.agents}> · agents</Show>
          </div>
        </Show>
      </div>
      <div class="settings__row-actions">
        <button
          type="button"
          class="btn btn--secondary"
          data-testid={`settings-row-select-${props.entry.id}`}
          onClick={() => reg.select(props.entry.id)}
          disabled={reg.current()?.id === props.entry.id}
        >
          Use
        </button>
        <button
          type="button"
          class="btn btn--secondary"
          data-testid={`settings-row-refresh-${props.entry.id}`}
          onClick={() => void reg.refreshCapabilities(props.entry.id)}
        >
          Refresh
        </button>
        <button
          type="button"
          class="btn btn--danger"
          data-testid={`settings-row-remove-${props.entry.id}`}
          onClick={() => reg.remove(props.entry.id)}
          disabled={props.entry.kind === 'local-sidecar'}
          title={
            props.entry.kind === 'local-sidecar'
              ? 'The bundled sidecar can’t be removed.'
              : 'Remove this backend'
          }
        >
          Remove
        </button>
      </div>
    </li>
  );
}
