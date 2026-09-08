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
  inlineDetail = false,
}: {
  icon: ReactNode;
  title: ReactNode;
  detail?: string;
  status?: ClioStatusValue;
  duration?: number;
  action?: ReactNode;
  inlineDetail?: boolean;
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
        <span className={`flex items-center gap-2 ${inlineDetail ? '' : 'flex-wrap'}`}>
          <span className="min-w-0 max-w-full font-medium">{title}</span>
          {status ? <ClioStatus value={status} className="shrink-0 text-sm" /> : null}
          {duration !== undefined ? (
            <span className="shrink-0 text-sm text-muted-foreground">
              {formatDuration(duration)}
            </span>
          ) : null}
          {inlineDetail && detail ? (
            <span className="max-w-[42ch] truncate text-muted-foreground" title={detail}>
              {detail}
            </span>
          ) : null}
        </span>
        {detail && !inlineDetail ? (
          <span className="block text-sm leading-6 text-muted-foreground">{detail}</span>
        ) : null}
      </span>
      {action ? <span className="ml-auto shrink-0">{action}</span> : null}
    </span>
  );
}
