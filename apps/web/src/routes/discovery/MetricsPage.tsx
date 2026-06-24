/**
 * Discovery surface: Metrics Page component. Key export `MetricsPageProps`.
 */
import { createResource, For, Show } from 'solid-js';
import type { Client } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import { formatCostUsd, formatCount } from '../../formatters.js';
import {
  formatLatencyDetail,
  formatLatencyValue,
  humanUptime,
  latencyEntries,
  statusValueClass,
} from './MetricsPageModel.js';

export interface MetricsPageProps {
  client: Client;
}

export function MetricsPage(props: MetricsPageProps) {
  const [data, { refetch }] = createResource(() => props.client.metrics());
  return (
    <DiscoveryPage
      icon="metrics"
      title="Metrics"
      subtitle="Backend activity, token usage, cost, and latency."
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
      onRetry={() => void refetch()}
    >
      <Show when={data()}>
        {(d) => (
          <>
            <div class="dp__section-title">Sessions</div>
            <div class="dp__stats">
              <div class="dp__stat">
                <div class="dp__stat-label">total</div>
                <div class="dp__stat-value">
                  {formatCount(d().sessions?.total ?? 0)}
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
                      <div class={'dp__stat-value ' + statusValueClass(k, v)}>
                        {v}
                      </div>
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
                  {formatCount(d().tokens?.input_total ?? 0)}
                </div>
              </div>
              <div class="dp__stat">
                <div class="dp__stat-label">output</div>
                <div class="dp__stat-value">
                  {formatCount(d().tokens?.output_total ?? 0)}
                </div>
              </div>
              <Show when={d().tokens?.cache_read_total != null}>
                <div class="dp__stat">
                  <div class="dp__stat-label">cache read</div>
                  <div class="dp__stat-value">
                    {formatCount(d().tokens?.cache_read_total ?? 0)}
                  </div>
                </div>
              </Show>
            </div>

            <div class="dp__section-title">Cost</div>
            <div class="dp__stats">
              <div class="dp__stat">
                <div class="dp__stat-label">total</div>
                <div class="dp__stat-value">
                  ${formatCostUsd(d().cost?.total_usd ?? 0)}
                </div>
              </div>
              <Show when={d().cost?.by_provider}>
                <For each={Object.entries(d().cost!.by_provider!)}>
                  {([k, v]) => (
                    <div class="dp__stat">
                      <div class="dp__stat-label">{k}</div>
                      <div class="dp__stat-value">${formatCostUsd(v)}</div>
                    </div>
                  )}
                </For>
              </Show>
            </div>

            <div class="dp__section-title">Backend latency</div>
            <Show
              when={latencyEntries(d().latencies).length > 0}
              fallback={
                <div class="dp__empty dp__empty--inline" data-testid="metrics-latency-empty">
                  <div class="dp__empty-icon">
                    <Icon name="metrics" size={20} />
                  </div>
                  <h2 class="dp__empty-title">No latency samples yet</h2>
                  <p class="dp__empty-body">
                    This backend is reporting sessions and messages, but no backend
                    latency buckets are populated.
                  </p>
                </div>
              }
            >
              <div class="dp__stats" data-testid="metrics-latency-stats">
                <For each={latencyEntries(d().latencies)}>
                  {([k, v]) => (
                    <div class="dp__stat">
                      <div class="dp__stat-label">{k}</div>
                      <div class="dp__stat-value">{formatLatencyValue(v)}</div>
                      <Show when={formatLatencyDetail(v)}>
                        {(detail) => (
                          <div class="dp__stat-sub">
                            {detail()}
                          </div>
                        )}
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <div class="dp__section-title">Backend</div>
            <div class="dp__stats">
              <div class="dp__stat">
                <div class="dp__stat-label">uptime</div>
                <div class="dp__stat-value">{humanUptime(d().uptime_s)}</div>
                <div class="dp__stat-sub">{formatCount(d().uptime_s)}s</div>
              </div>
              <div class="dp__stat">
                <div class="dp__stat-label">messages</div>
                <div class="dp__stat-value">
                  {formatCount(d().messages?.total ?? 0)}
                </div>
              </div>
            </div>
          </>
        )}
      </Show>
    </DiscoveryPage>
  );
}
