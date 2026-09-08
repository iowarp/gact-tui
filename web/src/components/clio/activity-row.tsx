import type { ReactNode } from 'react';
import { ClioStatus, type ClioStatusValue } from './status';
import { formatDuration } from '@/lib/format';

/** Shared transcript composition for tool and child-agent activity. */
export function ActivityRow({
  icon,
  title,
  detail,
  status,
  duration,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  status?: ClioStatusValue;
  duration?: number;
  action?: ReactNode;
}) {
  return (
    <span
      className="flex w-full min-w-0 items-start gap-2 py-1 text-sm leading-6"
      data-slot="activity-row"
    >
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{title}</span>
          {status ? <ClioStatus value={status} /> : null}
          {duration !== undefined ? (
            <span className="text-sm text-muted-foreground">{formatDuration(duration)}</span>
          ) : null}
          {action}
        </span>
        {detail ? (
          <span className="block text-sm leading-6 text-muted-foreground">{detail}</span>
        ) : null}
      </span>
    </span>
  );
}
