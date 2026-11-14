import { useSyncExternalStore, type HTMLAttributes } from 'react';
import {
  RelativeTime,
  RelativeTimeZone,
  RelativeTimeZoneDate,
  RelativeTimeZoneDisplay,
} from '@/components/kibo-ui/relative-time';
import { formatFullTimestamp } from '@/lib/full-timestamp';
import { cn } from '@/lib/utils';
import { formatLocale } from '@/lib/locale-format';
import { t } from '@lingui/core/macro';

interface ClioRelativeTimeProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  timestamp: string;
  compact?: boolean;
  label?: string;
}

/** CLIO presentation for a server timestamp, composed from Kibo Relative Time. */
export function ClioRelativeTime({
  timestamp,
  compact = false,
  label = t`Last interaction`,
  className,
  ...props
}: ClioRelativeTimeProps) {
  const time = new Date(timestamp);
  const valid = !Number.isNaN(time.getTime());
  // Every compact label reads one shared coarse clock and re-renders only when its text changes.
  const compactText = useSyncExternalStore(subscribeClock, () =>
    compact && valid ? compactTimestamp(time, clockNow()) : '',
  );
  if (!valid) {
    return <span className={className}>{t`Unavailable`}</span>;
  }

  const fullLabel = formatFullTimestamp(time);

  if (compact) {
    return (
      <time
        aria-label={`${label} ${fullLabel}`}
        className={cn('shrink-0 text-[0.625rem] tabular-nums text-muted-foreground', className)}
        dateTime={timestamp}
        title={`${label} ${fullLabel}`}
        {...props}
      >
        {compactText}
      </time>
    );
  }

  const timeZone = LOCAL_TIME_ZONE;
  return (
    <RelativeTime
      aria-label={`${label} ${fullLabel}`}
      className={cn('gap-0', className)}
      dateFormatOptions={{ month: 'short', day: 'numeric', year: 'numeric' }}
      time={time}
      timeFormatOptions={{ hour: 'numeric', minute: '2-digit' }}
      title={`${label} ${fullLabel}`}
      {...props}
    >
      <RelativeTimeZone className="justify-start gap-1.5" zone={timeZone}>
        <RelativeTimeZoneDate className="truncate" />
        <RelativeTimeZoneDisplay className="p-0" />
      </RelativeTimeZone>
    </RelativeTime>
  );
}

// Formatters are costly to build; a list of rows shares these.
const WEEKDAY = new Intl.DateTimeFormat(formatLocale(), { weekday: 'short' });
const MONTH_DAY = new Intl.DateTimeFormat(formatLocale(), { month: 'short', day: 'numeric' });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat(formatLocale(), {
  month: 'short',
  day: 'numeric',
  year: '2-digit',
});
const LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// One coarse clock for every compact label: it ticks only while one is mounted.
const CLOCK_TICK_MS = 30_000;
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | undefined;
let clockAt = Date.now();

function clockNow(): number {
  return clockTimer === undefined ? Date.now() : clockAt;
}

function subscribeClock(listener: () => void): () => void {
  clockListeners.add(listener);
  if (clockTimer === undefined) {
    clockAt = Date.now();
    clockTimer = setInterval(() => {
      clockAt = Date.now();
      for (const notify of clockListeners) notify();
    }, CLOCK_TICK_MS);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockTimer !== undefined) {
      clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

function compactTimestamp(time: Date, nowMs: number): string {
  const now = new Date(nowMs);
  const elapsedMilliseconds = Math.max(0, now.getTime() - time.getTime());
  const elapsedMinutes = Math.floor(elapsedMilliseconds / 60_000);
  if (elapsedMinutes < 1) return 'Now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h`;

  // Within the past week the spec names the weekday; calendar days keep last week's
  // same weekday from reading as today.
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const calendarDays = Math.round((startOfDay(now) - startOfDay(time)) / 86_400_000);
  if (calendarDays < 7) return WEEKDAY.format(time);

  if (time.getFullYear() === now.getFullYear()) return MONTH_DAY.format(time);
  return MONTH_DAY_YEAR.format(time);
}
