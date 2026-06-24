/**
 * Inspector "Timeline" tab: renders the assembled per-message execution
 * timeline as a duration-scaled list of events.
 */
import { createMemo, For, Show } from 'solid-js';
import type { Message } from '@clio/core';
import { formatDurationSeconds, formatTime } from '../formatters.js';
import { assembleTimeline, type SemanticTurnGroup } from './InspectorTimeline.js';

export interface TimelineTabProps {
  message: Message | null;
  semanticGroups: SemanticTurnGroup[];
}

export function TimelineTab(props: TimelineTabProps) {
  const events = createMemo(() => (props.message ? assembleTimeline(props.message) : []));
  const maxDuration = createMemo(() => Math.max(1, ...events().map((e) => e.durationMs ?? 0)));

  return (
    <section class="inspector__sect" data-testid="inspector-timeline">
      <Show when={!!props.message && props.message.parts.length > 0}>
        <div class="inspector__sect-title">Execution timeline</div>
        <ol class="inspector__timeline" data-testid="inspector-timeline-list">
          <For each={events()}>
            {(ev) => (
              <li
                class={
                  'inspector__tl-event' +
                  ` inspector__tl-event--${ev.kind}` +
                  ` inspector__tl-event--${ev.status}`
                }
                data-testid={`timeline-event-${ev.kind}`}
              >
                <span class="inspector__tl-dot" aria-hidden="true" />
                <div class="inspector__tl-body">
                  <div class="inspector__tl-head">
                    <span class="inspector__tl-label">{ev.label}</span>
                    <Show when={ev.durationMs != null}>
                      <span class="inspector__tl-dur">
                        {ev.durationMs! >= 1000
                          ? `${formatDurationSeconds(ev.durationMs!)}s`
                          : `${ev.durationMs}ms`}
                      </span>
                    </Show>
                    <Show when={ev.at}>
                      <span class="inspector__tl-time">
                        {formatTime(ev.at!)}
                      </span>
                    </Show>
                  </div>
                  <Show when={ev.detail}>
                    <div class="inspector__tl-detail">{ev.detail}</div>
                  </Show>
                  <Show when={ev.durationMs != null}>
                    <div
                      class="inspector__tl-bar"
                      style={{
                        width: `${Math.max(2, Math.round((ev.durationMs! / maxDuration()) * 100))}%`,
                      }}
                    />
                  </Show>
                </div>
              </li>
            )}
          </For>
        </ol>
      </Show>

      <Show when={props.semanticGroups.length > 0}>
        <div
          class="inspector__sect-title inspector__sect-title--semantic"
          data-testid="inspector-semantic-title"
        >
          Semantic trace
        </div>
        <For each={props.semanticGroups}>
          {(group) => (
            <div class="inspector__semantic-turn" data-testid={`semantic-turn-${group.turnId}`}>
              <Show when={group.turnId !== '(no turn)'}>
                <div class="inspector__semantic-turn-head">turn {group.turnId.slice(0, 8)}</div>
              </Show>
              <ol class="inspector__timeline inspector__timeline--semantic">
                <For each={group.rows}>
                  {(row) => (
                    <li
                      class={
                        'inspector__tl-event inspector__tl-event--semantic' +
                        ` inspector__tl-event--${row.status}`
                      }
                      data-testid={`semantic-event-${row.eventId}`}
                      data-event-type={row.eventType}
                    >
                      <span class="inspector__tl-dot" aria-hidden="true" />
                      <div class="inspector__tl-body">
                        <div class="inspector__tl-head">
                          <span class="inspector__tl-label">{row.label}</span>
                          <Show when={row.at}>
                            <span class="inspector__tl-time">
                              {formatTime(row.at!)}
                            </span>
                          </Show>
                        </div>
                      </div>
                    </li>
                  )}
                </For>
              </ol>
            </div>
          )}
        </For>
      </Show>
    </section>
  );
}
