import { createComponentImplementation } from '@a2ui/react/v0_9';
import { DateTimeInputApi } from '@a2ui/web_core/v0_9/basic_catalog';
import { DateTimeField } from './date-time-field';

/** Offset-bearing timestamps represent instants; wall times keep their original local meaning. */
export function dateTimeFieldValue(value: string, date: boolean, time: boolean): string {
  let wall = value;
  if (value.includes('T') && /(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) {
    const instant = new Date(value);
    if (!Number.isNaN(instant.getTime())) {
      wall = new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 19);
    }
  }
  const parts = wall.split('T');
  const day = /^\d{4}-\d{2}-\d{2}/u.exec(parts[0] ?? '')?.[0] ?? '';
  const clock = /^\d{2}:\d{2}(?::\d{2})?/u.exec(parts[1] ?? wall)?.[0] ?? '';
  return date ? (time && day && clock ? `${day}T${clock}` : day) : clock;
}

/** Preserve the DateTimeInput binding, bounds, and instant when editing in the displayed local zone. */
export const ClioDateTimeInput = createComponentImplementation(DateTimeInputApi, ({ props }) => {
  const value = typeof props.value === 'string' ? props.value : '';
  const date = props.enableDate === true;
  const time = props.enableTime === true;
  const instant = date && time && /(?:Z|[+-]\d{2}:\d{2})$/u.test(value);
  const local = dateTimeFieldValue(value, date, time);
  return (
    <DateTimeField
      value={local}
      onChange={(next) =>
        props.setValue(instant ? (next === local ? value : new Date(next).toISOString()) : next)
      }
      label={props.label || (props.enableDate ? 'Date and time' : 'Time')}
      enableDate={date}
      enableTime={time}
      min={typeof props.min === 'string' ? dateTimeFieldValue(props.min, date, time) : undefined}
      max={typeof props.max === 'string' ? dateTimeFieldValue(props.max, date, time) : undefined}
      timezone={
        props.enableDate && props.enableTime
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : undefined
      }
    />
  );
});
