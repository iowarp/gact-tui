/**
 * Backends settings section: the configured-backend list and add action.
 * Exports {@link SettingsBackends}.
 */
import { For, Show } from 'solid-js';
import { useBackendRegistry } from '../registry.js';
import { SettingsBackendRow } from './SettingsBackendRow.js';
import './settings.css';

export interface SettingsBackendsProps {
  onAddRemote: () => void;
  onBack: () => void;
}

/**
 * /settings/backends — list registered backends, refresh capabilities,
 * remove, or open the add-remote wizard. HTTP works in web and desktop;
 * desktop can also open an SSH tunnel through the native shell.
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
          data-testid="settings-backends-back"
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
          data-testid="settings-backends-add-remote"
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
                The bundled agent backend registers itself on first launch; additional backends
                (remote ALCF, SSH-tunneled, etc.) can be added with{' '}
                <strong>Add remote backend</strong>.
              </p>
            </div>
          }
        >
          <ul class="settings__list">
            <For each={reg.state().backends}>{(b) => <SettingsBackendRow entry={b} />}</For>
          </ul>
        </Show>
      </main>
    </div>
  );
}
