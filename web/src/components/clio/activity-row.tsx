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
      className="flex w-full min-w-0 items-center gap-1.5 py-0.5 text-sm leading-5"
      data-slot="activity-row"
    >
      <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-2 ${inlineDetail ? '' : 'flex-wrap'}`}>
          <span className="min-w-0 max-w-full font-medium">{title}</span>
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
          <span className="block text-sm leading-5 text-muted-foreground">{detail}</span>
        ) : null}
      </span>
      {status ? <ClioStatus compact value={status} className="ml-auto shrink-0" /> : null}
      {action ? <span className={status ? 'shrink-0' : 'ml-auto shrink-0'}>{action}</span> : null}
    </span>
  );
}
