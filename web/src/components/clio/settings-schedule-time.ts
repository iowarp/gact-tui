import { t } from '@lingui/core/macro';
import { formatLocale } from '@/lib/locale-format';

export type ScheduleKind = 'once' | 'repeating';
export type RepeatPreset = 'daily' | 'weekdays' | 'weekly' | 'advanced';

export const weekdayLabels = [
  ['1', t`Monday`],
  ['2', t`Tuesday`],
  ['3', t`Wednesday`],
  ['4', t`Thursday`],
  ['5', t`Friday`],
  ['6', t`Saturday`],
  ['0', t`Sunday`],
] as const;

/** "Every Monday" for a cron day of week (`0` is Sunday); "Every week" for any other value. */
export function everyWeekday(weekday: string): string {
  switch (weekday) {
    case '1':
      return t`Every Monday`;
    case '2':
      return t`Every Tuesday`;
    case '3':
      return t`Every Wednesday`;
    case '4':
      return t`Every Thursday`;
    case '5':
      return t`Every Friday`;
    case '6':
      return t`Every Saturday`;
    case '0':
      return t`Every Sunday`;
    default:
      return t`Every week`;
  }
}

/** `YYYY-MM-DDTHH:MM` in local wall time, the value the date-time field edits. */
export function toLocalInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function defaultOnceAt() {
  return toLocalInput(new Date(Date.now() + 60 * 60 * 1000));
}

function dateParts(date: Date, timezone?: string) {
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      ...options,
      ...(timezone ? { timeZone: timezone } : {}),
    }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(date);
  }
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return {
    day: part('day'),
    month: part('month'),
    year: part('year'),
    time: `${part('hour')}:${part('minute')}`,
  };
}

function localizedDateTime(date: Date, timezone: string | undefined, short: boolean) {
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    ...(short ? {} : { year: 'numeric' as const }),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  };
  try {
    return new Intl.DateTimeFormat(formatLocale(), {
      ...options,
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(formatLocale(), options).format(date);
  }
}

/**
 * "14 Nov 2026 16:00": the page's one date format, a 24-hour clock like the
 * date-time field. `short` drops the year, as a row does.
 */
export function formatDateTime(value: string, timezone?: string, short = false) {
  if (!value) return t`Not scheduled`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t`Unavailable`;
  // English keeps the page's own day-month order; other languages use their own date format.
  if (!formatLocale().startsWith('en')) return localizedDateTime(date, timezone, short);
  const { day, month, year, time } = dateParts(date, timezone);
  return short ? `${day} ${month} ${time}` : `${day} ${month} ${year} ${time}`;
}

export function buildCron(preset: RepeatPreset, time: string, weekday: string, custom: string) {
  if (preset === 'advanced') return custom.trim();
  const [hour = '9', minute = '0'] = time.split(':');
  if (preset === 'weekdays') return `${Number(minute)} ${Number(hour)} * * 1-5`;
  if (preset === 'weekly') return `${Number(minute)} ${Number(hour)} * * ${weekday}`;
  return `${Number(minute)} ${Number(hour)} * * *`;
}

const pad = (value: string) => value.padStart(2, '0');

/** A five-part expression read back into the dialog's presets. */
export function parseCron(cron: string): {
  preset: RepeatPreset;
  time: string;
  weekday: string;
} {
  const match = /^(\d{1,2}) (\d{1,2}) \* \* (\*|1-5|[0-6])$/u.exec(cron.trim());
  if (!match) return { preset: 'advanced', time: '09:00', weekday: '1' };
  const [, minute = '0', hour = '9', day = '*'] = match;
  const time = `${pad(hour)}:${pad(minute)}`;
  if (day === '*') return { preset: 'daily', time, weekday: '1' };
  if (day === '1-5') return { preset: 'weekdays', time, weekday: '1' };
  return { preset: 'weekly', time, weekday: day };
}
