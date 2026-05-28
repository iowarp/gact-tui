import { createResource, For, Show } from 'solid-js';
import type { Client } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';

export interface MetricsPageProps {
  client: Client;
}

export function MetricsPage(props: MetricsPageProps) {
  const [data, { refetch }] = createResource(() => props.client.metrics());
  return (
    <DiscoveryPage
      icon="metrics"
      title="Metrics"
      subtitle="Aggregate telemetry from this backend's lifecycle."
      actions={
        <button
          type="button"
          class="dp-iconbtn"
          onClick={() => refetch()}
          title="Refresh"
        >
          <Icon name="regenerate" size={14} />
        </button>
      }
      loading={data.loading}
      error={data.error ? String((data.error as Error).message ?? data.error) : null}
    >
      <Show when={data()}>
        {(d) => (
          <>
            <div class="dp__section-title">Sessions</div>
            <div class="dp__stats">
              <div class="dp__stat">
                <div class="dp__stat-label">total</div>
                <div class="dp__stat-value">
                  {(d().sessions?.total ?? 0).toLocaleString()}
                </div>
              </div>
              <div class="dp__stat">
                <div class="dp__stat-label">active</div>
                <div class="dp__stat-value">{d().sessions?.active ?? 0}</div>
              </div>
              <Show when={d().sessions?.by_status}>
                <For each={Object.entries(d().sessions!.by_status!)}>
                  {([k, v]) => (
                    <div class="dp__stat">
                      <div class="dp__stat-label">{k}</div>
                      <div class="dp__stat-value">{v}</div>
                    </div>
                  )}
                </For>
              </Show>
            </div>

            <div class="dp__section-title">Tokens</div>
            <div class="dp__stats">
              <div class="dp__stat">
                <div class="dp__stat-label">input</div>
                <div class="dp__stat-value">
                  {(d().tokens?.input_total ?? 0).toLocaleString()}
                </div>
              </div>
              <div class="dp__stat">
                <div class="dp__stat-label">output</div>
                <div class="dp__stat-value">
                  {(d().tokens?.output_total ?? 0).toLocaleString()}
                </div>
              </div>
              <Show when={d().tokens?.cache_read_total != null}>
                <div class="dp__stat">
                  <div class="dp__stat-label">cache read</div>
                  <div class="dp__stat-value">
                    {(d().tokens?.cache_read_total ?? 0).toLocaleString()}
                  </div>
                </div>
              </Show>
            </div>

            <div class="dp__section-title">Cost</div>
            <div class="dp__stats">
              <div class="dp__stat">
                <div class="dp__stat-label">total</div>
                <div class="dp__stat-value">
                  ${(d().cost?.total_usd ?? 0).toFixed(4)}
                </div>
              </div>
              <Show when={d().cost?.by_provider}>
                <For each={Object.entries(d().cost!.by_provider!)}>
                  {([k, v]) => (
                    <div class="dp__stat">
                      <div class="dp__stat-label">{k}</div>
                      <div class="dp__stat-value">${v.toFixed(4)}</div>
                    </div>
                  )}
                </For>
              </Show>
            </div>

            <div class="dp__section-title">Backend</div>
            <div class="dp__stats">
              <div class="dp__stat">
                <div class="dp__stat-label">uptime</div>
                <div class="dp__stat-value">{humanUptime(d().uptime_s)}</div>
                <div class="dp__stat-sub">{d().uptime_s.toLocaleString()}s</div>
              </div>
              <div class="dp__stat">
                <div class="dp__stat-label">messages</div>
                <div class="dp__stat-value">
                  {(d().messages?.total ?? 0).toLocaleString()}
                </div>
              </div>
            </div>
          </>
        )}
      </Show>
    </DiscoveryPage>
  );
}

function humanUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
