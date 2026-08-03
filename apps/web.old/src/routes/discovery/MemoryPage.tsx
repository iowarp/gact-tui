/**
 * Discovery surface: Memory Page component. Key export `MemoryPageProps`.
 */
import { createResource, Show } from 'solid-js';
import type { Client } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';
import { MemoryHealthReadout } from '../../components/MemoryHealthReadout.js';
import { formatCount } from '../../formatters.js';
import {
  MemoryEventsSection,
  MemorySearchSection,
  type MemoryEventRow,
} from './MemorySections.js';

export interface MemoryPageProps {
  client: Client;
  /** Optional active session id — when present, also fetches its memory events. */
  activeSessionId?: string;
}

export function MemoryPage(props: MemoryPageProps) {
  // Keyed on the active session so the per-session context-budget block
  // (tokens_retained / token_pressure / threshold_state) is populated when a
  // session is open, and falls back to backend-wide stats otherwise.
  const [data, { refetch }] = createResource(
    () => props.activeSessionId ?? '',
    (sid) => props.client.memoryStats(sid || undefined),
  );

  // Events resource keyed on the active session — only refetches when
  // the user switches sessions or hits Refresh.
  const [eventsData, { refetch: refetchEvents }] = createResource(
    () => props.activeSessionId,
    async (sid) => {
      if (!sid) return { events: [] };
      try {
        return await props.client.sessionMemoryEvents(sid, 50);
      } catch {
        return { events: [] };
      }
    },
  );
  const events = () => (eventsData()?.events ?? []) as MemoryEventRow[];

  // Per-expert context state for the active session — feeds the segmented
  // category bar inside the health readout. Best-effort: a backend without the
  // x_clio_context_state route simply leaves the breakdown hidden.
  const [contextState] = createResource(
    () => props.activeSessionId,
    async (sid) => {
      if (!sid) return undefined;
      try {
        return await props.client.getContextState(sid);
      } catch {
        return undefined;
      }
    },
  );

  return (
    <DiscoveryPage
      icon="memory"
      title="Memory"
      subtitle="ARC cache + persistent memory layer telemetry."
      actions={
        <button
          type="button"
          class="dp-iconbtn"
          onClick={() => {
            void refetch();
            void refetchEvents();
          }}
          title="Refresh"
        >
          <Icon name="regenerate" size={14} />
        </button>
      }
      loading={data.loading}
      error={data.error ? String((data.error as Error).message ?? data.error) : null}
      onRetry={() => void refetch()}
    >
      <MemorySearchSection client={props.client} />

      <Show when={data()}>
        {(d) => (
          <>
            <div class="dp__section-title">Health</div>
            <MemoryHealthReadout
              stats={d()}
              {...(contextState() ? { contextState: contextState() } : {})}
            />
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
                <div class="dp__stat-value">{formatCount(d().cache.capacity)}</div>
                <div class="dp__stat-sub">entries</div>
              </div>
            </div>

            <Show when={d().global}>
              <div class="dp__section-title">Lifetime</div>
              <div class="dp__stats">
                <div class="dp__stat">
                  <div class="dp__stat-label">conversations</div>
                  <div class="dp__stat-value">
                    {formatCount(d().global!.conversations_total ?? 0)}
                  </div>
                </div>
                <div class="dp__stat">
                  <div class="dp__stat-label">invocations</div>
                  <div class="dp__stat-value">
                    {formatCount(d().global!.invocations_total ?? 0)}
                  </div>
                </div>
              </div>
            </Show>
          </>
        )}
      </Show>

      <MemoryEventsSection activeSessionId={props.activeSessionId} events={events()} />
    </DiscoveryPage>
  );
}
