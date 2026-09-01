import type { HTMLAttributes } from 'react';
import {
  RelativeTime,
  RelativeTimeZone,
  RelativeTimeZoneDate,
  RelativeTimeZoneDisplay,
} from '@/components/kibo-ui/relative-time';
import { cn } from '@/lib/utils';

interface ClioRelativeTimeProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  timestamp: string;
  compact?: boolean;
  label?: string;
}

/** CLIO presentation for a server timestamp, composed from Kibo Relative Time. */
export function ClioRelativeTime({
  timestamp,
  compact = false,
  label = 'Last interaction',
  className,
  ...props
}: ClioRelativeTimeProps) {
  const time = new Date(timestamp);
  if (Number.isNaN(time.getTime())) {
    return <span className={className}>Unavailable</span>;
  }

  const fullLabel = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(time);

  if (compact) {
    return (
      <time
        aria-label={`${label} ${fullLabel}`}
        className={cn('shrink-0 text-[10px] tabular-nums text-muted-foreground', className)}
        dateTime={timestamp}
        title={`${label} ${fullLabel}`}
        {...props}
      >
        {compactTimestamp(time)}
      </time>
    );
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
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

function compactTimestamp(time: Date): string {
  const now = new Date();
  const elapsedMilliseconds = Math.max(0, now.getTime() - time.getTime());
  const elapsedMinutes = Math.floor(elapsedMilliseconds / 60_000);
  if (elapsedMinutes < 1) return 'Now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays}d ago`;

  if (time.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(time);
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  }).format(time);
}
