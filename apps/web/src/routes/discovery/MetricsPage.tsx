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

export function latencyEntries(latencies: Record<string, unknown> | undefined): Array<[string, unknown]> {
  return Object.entries(latencies ?? {}).filter(([, value]) => value != null);
}

export function formatLatencyValue(value: unknown): string {
  if (typeof value === 'number') return `${Math.round(value)}ms`;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value) {
    const record = value as Record<string, unknown>;
    if (typeof record['p50_ms'] === 'number') return `p50 ${formatMs(record['p50_ms'])}`;
    if (typeof record['avg_ms'] === 'number') return `avg ${formatMs(record['avg_ms'])}`;
    if (typeof record['mean_ms'] === 'number') return `mean ${formatMs(record['mean_ms'])}`;
    if (typeof record['last_ms'] === 'number') return `last ${formatMs(record['last_ms'])}`;
    if (typeof record['count'] === 'number') return `${Math.round(record['count'])} samples`;
  }
  return 'reported';
}

export function formatLatencyDetail(value: unknown): string {
  if (typeof value !== 'object' || !value) return '';
  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof record['count'] === 'number') parts.push(`${Math.round(record['count'])} samples`);
  if (typeof record['p95_ms'] === 'number') parts.push(`p95 ${formatMs(record['p95_ms'])}`);
  if (typeof record['max_ms'] === 'number') parts.push(`max ${formatMs(record['max_ms'])}`);
  return parts.join(' · ');
}

function formatMs(value: number): string {
  if (value >= 100) return `${Math.round(value)}ms`;
  if (value >= 10) return `${Math.round(value * 10) / 10}ms`;
  return `${Math.round(value * 100) / 100}ms`;
}

/**
 * Semantic tint for a session-status numeral: a non-zero error/failed count
 * is the error tint, waiting/blocked is warning, running/active is success.
 * Zero stays neutral so a healthy board doesn't shout.
 */
function statusValueClass(status: string, value: number): string {
  if (value === 0) return '';
  const s = status.toLowerCase();
  if (/(error|fail|crash|denied)/.test(s)) return 'dp__stat-value--err';
  if (/(wait|block|pending|paused)/.test(s)) return 'dp__stat-value--warn';
  if (/(run|active|ok|ready|done|complete)/.test(s)) return 'dp__stat-value--ok';
  return '';
}

function humanUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
