/**
 * Inspector 'Schedules' tab: list/create scheduled runs. Exports
 * {@link SchedulesTab} and the {@link ScheduleRow} shape.
 */
import { For, Show } from 'solid-js';
import { InspectorScheduleCreateForm } from './InspectorScheduleCreateForm.js';
import { InspectorScheduleRow } from './InspectorScheduleRow.js';

export interface ScheduleRow {
  id: string;
  cron?: string;
  next_run_at?: string;
  enabled?: boolean;
  prompt?: string;
}

/** Cron-style schedules per session. Capability-gated upstream. */
export function SchedulesTab(props: {
  schedules: ScheduleRow[];
  onCreate?: (body: { cron: string; prompt: string }) => void | Promise<void>;
  onDelete?: (scheduleId: string) => void | Promise<void>;
}) {
  return (
    <section class="inspector__sect">
      <div class="inspector__sect-title">Schedules ({props.schedules.length})</div>
      <ul class="inspector__schedules">
        <For each={props.schedules}>
          {(s) => (
            <InspectorScheduleRow schedule={s} onDelete={props.onDelete} />
          )}
        </For>
      </ul>
      <Show when={props.onCreate}>
        <InspectorScheduleCreateForm onCreate={props.onCreate!} />
      </Show>
    </section>
  );
}
