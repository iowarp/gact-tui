import { createResource, createSignal, For, Show } from 'solid-js';
import type { Client } from '@clio/core';
import { DiscoveryPage } from '../../components/DiscoveryPage.js';
import { Icon } from '../../components/Icon.js';

export interface MemoryPageProps {
  client: Client;
  /** Optional active session id — when present, also fetches its memory events. */
  activeSessionId?: string;
}

interface MemoryEventRow {
  id?: string;
  type?: string;
  scope?: string;
  created_at?: string;
  message?: string;
  payload?: Record<string, unknown>;
  [k: string]: unknown;
}

export function MemoryPage(props: MemoryPageProps) {
  const [data, { refetch }] = createResource(() => props.client.memoryStats());

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
  const [showEvents, setShowEvents] = createSignal(true);

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

      <Show when={props.activeSessionId}>
        <button
          type="button"
          class="mem__events-toggle"
          onClick={() => setShowEvents((v) => !v)}
          data-testid="memory-events-toggle"
        >
          <Icon
            name="chevron-right"
            size={11}
            class={'mem__events-chev ' + (showEvents() ? 'is-open' : '')}
          />
          <span>
            Events for current session
            <Show when={events().length > 0}>
              {' '}({events().length})
            </Show>
          </span>
        </button>
        <Show when={showEvents()}>
          <ul class="mem__events" data-testid="memory-events-list">
            <Show
              when={events().length > 0}
              fallback={
                <li class="mem__events-empty">
                  No memory events recorded for this session yet.
                </li>
              }
            >
              <For each={events()}>
                {(e) => (
                  <li class="mem__event" data-testid={`memory-event-${e.id ?? ''}`}>
                    <span
                      class={
                        'mem__event-type mem__event-type--' +
                        ((e.type ?? 'event').split('.')[0] ?? 'event')
                      }
                    >
                      {e.type ?? 'event'}
                    </span>
                    <Show when={e.scope}>
                      <span class="mem__event-scope">{e.scope}</span>
                    </Show>
                    <Show when={e.message}>
                      <span class="mem__event-message">{e.message}</span>
                    </Show>
                    <Show when={e.created_at}>
                      <span class="mem__event-when">{humanWhen(e.created_at!)}</span>
                    </Show>
                  </li>
                )}
              </For>
            </Show>
          </ul>
        </Show>
      </Show>
    </DiscoveryPage>
  );
}

function humanWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const delta = Date.now() - d.getTime();
  const min = Math.round(delta / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}
