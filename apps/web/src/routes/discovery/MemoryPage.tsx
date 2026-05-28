import { createResource, Show } from 'solid-js';
import type { Client } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';

export interface MemoryPageProps {
  client: Client;
}

export function MemoryPage(props: MemoryPageProps) {
  const [data, { refetch }] = createResource(() => props.client.memoryStats());
  return (
    <DiscoveryPage
      icon="memory"
      title="Memory"
      subtitle="ARC cache + persistent memory layer telemetry."
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
            <div class="dp__section-title">Cache</div>
            <div class="dp__stats">
              <div class="dp__stat">
                <div class="dp__stat-label">hit rate</div>
                <div class="dp__stat-value">
                  {(d().cache.hit_rate * 100).toFixed(1)}%
                </div>
                <div class="dp__stat-sub">
                  {d().cache.hits} hits · {d().cache.misses} misses
                </div>
              </div>
              <div class="dp__stat">
                <div class="dp__stat-label">capacity</div>
                <div class="dp__stat-value">{d().cache.capacity.toLocaleString()}</div>
                <div class="dp__stat-sub">entries</div>
              </div>
            </div>

            <Show when={d().global}>
              <div class="dp__section-title">Lifetime</div>
              <div class="dp__stats">
                <div class="dp__stat">
                  <div class="dp__stat-label">conversations</div>
                  <div class="dp__stat-value">
                    {(d().global!.conversations_total ?? 0).toLocaleString()}
                  </div>
                </div>
                <div class="dp__stat">
                  <div class="dp__stat-label">invocations</div>
                  <div class="dp__stat-value">
                    {(d().global!.invocations_total ?? 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </Show>
          </>
        )}
      </Show>
    </DiscoveryPage>
  );
}
