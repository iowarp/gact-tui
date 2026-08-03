/**
 * Single backend row in the backends settings list (status chip + actions).
 * Exports {@link SettingsBackendRow}.
 */
import { For, Show, createSignal } from 'solid-js';
import { brand } from '@brand';
import type { BackendEntry } from '@clio/core';
import { Icon } from '../components/Icon.js';
import { useBackendRegistry } from '../registry.js';
import { inTauri, tauriFetch } from '../tauri.js';
import {
  backendAuthHeaders,
  backendCapabilityLabels,
  backendStatusChip,
  capabilitiesProbeUrl,
} from './SettingsBackendsModel.js';

type TestResult =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'ok'; ms: number }
  | { state: 'fail'; error: string };

export function SettingsBackendRow(props: { entry: BackendEntry }) {
  const reg = useBackendRegistry();
  const status = () => backendStatusChip(props.entry);

  // Per-backend connection test (W3 settings depth): probe /v1/capabilities
  // with timing and surface latency or the failure inline, distinct from
  // Refresh, which silently re-pulls capabilities into the registry.
  const [testResult, setTestResult] = createSignal<TestResult>({ state: 'idle' });

  async function testConnection() {
    setTestResult({ state: 'running' });
    const started = performance.now();
    try {
      const fetchImpl = inTauri() ? tauriFetch : globalThis.fetch;
      const res = await fetchImpl(capabilitiesProbeUrl(props.entry), {
        headers: backendAuthHeaders(props.entry),
      });
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
            <For each={backendCapabilityLabels(props.entry)}>
              {(label, index) => (
                <>
                  <Show when={index() > 0}> · </Show>
                  {label}
                </>
              )}
            </For>
          </div>
        </Show>
      </div>
      <div class="settings__row-actions">
        <Show when={testResult().state !== 'idle'}>
          {(() => {
            const r = testResult();
            if (r.state === 'running')
              return (
                <span class="chip" data-testid={`settings-row-test-result-${props.entry.id}`}>
                  testing…
                </span>
              );
            if (r.state === 'ok')
              return (
                <span
                  class="chip chip--ok"
                  data-testid={`settings-row-test-result-${props.entry.id}`}
                >
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
        {/* Use = primary; Test/Refresh = quiet; Remove = quiet danger icon. */}
        <button
          type="button"
          class="btn btn--primary"
          data-testid={`settings-row-select-${props.entry.id}`}
          onClick={() => reg.select(props.entry.id)}
          disabled={reg.current()?.id === props.entry.id}
          title="Make this the active backend"
        >
          Use
        </button>
        <button
          type="button"
          class="btn btn--quiet"
          data-testid={`settings-row-test-${props.entry.id}`}
          onClick={() => void testConnection()}
          disabled={testResult().state === 'running'}
          title="Probe /v1/capabilities and measure latency"
        >
          Test
        </button>
        <button
          type="button"
          class="btn btn--quiet"
          data-testid={`settings-row-refresh-${props.entry.id}`}
          onClick={() => void reg.refreshCapabilities(props.entry.id)}
          title="Re-pull capabilities"
        >
          Refresh
        </button>
        <button
          type="button"
          class="settings__row-remove"
          data-testid={`settings-row-remove-${props.entry.id}`}
          onClick={() => reg.remove(props.entry.id)}
          disabled={props.entry.kind === 'local-sidecar'}
          aria-label="Remove this backend"
          title={
            props.entry.kind === 'local-sidecar'
              ? `The bundled ${brand.name} backend can't be removed.`
              : 'Remove this backend'
          }
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </li>
  );
}
