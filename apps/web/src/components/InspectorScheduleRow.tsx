/**
 * Single schedule row in the inspector schedules tab. Exports
 * {@link InspectorScheduleRow}.
 */
import { Show } from 'solid-js';
import { Icon } from './Icon.js';
import { humanRelativeIso } from './InspectorScheduleModel.js';
import type { ScheduleRow } from './InspectorSchedules.js';

export function InspectorScheduleRow(props: {
  schedule: ScheduleRow;
  onDelete?: (scheduleId: string) => void | Promise<void>;
}) {
  const schedule = () => props.schedule;

  return (
    <li
      class={
        'inspector__schedule ' +
        (schedule().enabled === false ? 'inspector__schedule--off' : '')
      }
      data-testid={`inspector-schedule-${schedule().id}`}
    >
      <div class="inspector__schedule-head">
        <code class="inspector__schedule-cron">{schedule().cron ?? '(no cron)'}</code>
        <Show when={schedule().enabled === false}>
          <span class="inspector__chip">disabled</span>
        </Show>
        <Show when={schedule().next_run_at}>
          <span class="inspector__schedule-next" title={schedule().next_run_at}>
            next {humanRelativeIso(schedule().next_run_at!)}
          </span>
        </Show>
        <Show when={props.onDelete}>
          <button
            type="button"
            class="inspector__schedule-x"
            title="Delete schedule"
            aria-label="Delete schedule"
            onClick={() => void props.onDelete?.(schedule().id)}
          >
            <Icon name="close" size={10} />
          </button>
        </Show>
      </div>
      <Show when={schedule().prompt}>
        <div class="inspector__schedule-prompt">{schedule().prompt}</div>
      </Show>
    </li>
  );
}
