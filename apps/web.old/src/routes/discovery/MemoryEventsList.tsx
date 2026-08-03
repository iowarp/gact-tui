/**
 * Discovery surface: Memory Events List component. Key export `MemoryEventsList`.
 */
import { For, Show } from 'solid-js';
import {
  humanWhen,
  memoryEventTypeTone,
  type MemoryEventRow,
} from './MemorySectionsModel.js';

export function MemoryEventsList(props: { events: MemoryEventRow[] }) {
  return (
    <ul class="mem__events" data-testid="memory-events-list">
      <Show
        when={props.events.length > 0}
        fallback={
          <li class="mem__events-empty">No memory events recorded for this session yet.</li>
        }
      >
        <For each={props.events}>
          {(e) => (
            <li class="mem__event" data-testid={`memory-event-${e.id ?? ''}`}>
              <span class={'mem__event-type mem__event-type--' + memoryEventTypeTone(e.type)}>
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
  );
}
