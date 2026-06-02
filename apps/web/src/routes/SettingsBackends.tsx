import { For, Show, createSignal } from 'solid-js';
import { useBackendRegistry } from '../registry.js';
import type { BackendEntry } from '@clio/core';
import { inTauri, tauriFetch } from '../tauri.js';
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
                The bundled <code>clio-agent-gact</code> backend registers
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

  // Per-backend connection test (W3 settings depth): probe /v1/capabilities
  // with timing and surface latency or the failure inline — distinct from
  // Refresh, which silently re-pulls capabilities into the registry.
  const [testResult, setTestResult] = createSignal<
    { state: 'idle' } | { state: 'running' } | { state: 'ok'; ms: number } | { state: 'fail'; error: string }
  >({ state: 'idle' });

  async function testConnection() {
    setTestResult({ state: 'running' });
    const started = performance.now();
    try {
      const fetchImpl = inTauri() ? tauriFetch : globalThis.fetch;
      const res = await fetchImpl(
        `${props.entry.url.replace(/\/+$/, '')}/v1/capabilities`,
        {
          headers: props.entry.bearerToken
            ? { Authorization: `Bearer ${props.entry.bearerToken}` }
            : {},
        },
      );
      const ms = Math.round(performance.now() - started);
      if (!res.ok) {
        setTestResult({ state: 'fail', error: `HTTP ${res.status} after ${ms}ms` });
        return;
      }
      await res.json();
      setTestResult({ state: 'ok', ms });
    } catch (e) {
      setTestResult({
        state: 'fail',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

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
            <Show when={props.entry.capabilities?.transports?.events_sse}> · sse</Show>
            <Show when={props.entry.capabilities?.capabilities?.permissions}> · permissions</Show>
            <Show when={props.entry.capabilities?.capabilities?.diffs}> · diffs</Show>
            <Show when={props.entry.capabilities?.capabilities?.agent_routing}> · agents</Show>
            <Show when={props.entry.capabilities?.capabilities?.mcp}> · mcp</Show>
            <Show when={props.entry.capabilities?.capabilities?.memory}> · memory</Show>
          </div>
        </Show>
      </div>
      <div class="settings__row-actions">
        <Show when={testResult().state !== 'idle'}>
          {(() => {
            const r = testResult();
            if (r.state === 'running')
              return <span class="chip" data-testid={`settings-row-test-result-${props.entry.id}`}>testing…</span>;
            if (r.state === 'ok')
              return (
                <span class="chip chip--ok" data-testid={`settings-row-test-result-${props.entry.id}`}>
                  ok · {r.ms}ms
                </span>
              );
            if (r.state === 'fail')
              return (
                <span
                  class="chip chip--err"
                  data-testid={`settings-row-test-result-${props.entry.id}`}
                  title={r.error}
                >
                  failed
                </span>
              );
            return null;
          })()}
        </Show>
        <button
          type="button"
          class="btn btn--secondary"
          data-testid={`settings-row-test-${props.entry.id}`}
          onClick={() => void testConnection()}
          disabled={testResult().state === 'running'}
          title="Probe /v1/capabilities and measure latency"
        >
          Test
        </button>
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
              ? 'The bundled clio can’t be removed.'
              : 'Remove this backend'
          }
        >
          Remove
        </button>
      </div>
    </li>
  );
}
