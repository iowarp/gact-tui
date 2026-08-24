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
}

/** CLIO presentation for a server timestamp, composed from Kibo Relative Time. */
export function ClioRelativeTime({
  timestamp,
  compact = false,
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
        aria-label={`Last interaction ${fullLabel}`}
        className={cn('shrink-0 text-[10px] tabular-nums text-muted-foreground', className)}
        dateTime={timestamp}
        title={`Last interaction ${fullLabel}`}
        {...props}
      >
        {compactTimestamp(time)}
      </time>
    );
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return (
    <RelativeTime
      aria-label={`Last interaction ${fullLabel}`}
      className={cn('gap-0', className)}
      dateFormatOptions={{ month: 'short', day: 'numeric', year: 'numeric' }}
      time={time}
      timeFormatOptions={{ hour: 'numeric', minute: '2-digit' }}
      title={`Last interaction ${fullLabel}`}
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
  if (
    time.getFullYear() === now.getFullYear() &&
    time.getMonth() === now.getMonth() &&
    time.getDate() === now.getDate()
  ) {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(time);
  }
  if (time.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(time);
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  }).format(time);
}
