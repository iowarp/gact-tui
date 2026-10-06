import type { ReactNode } from 'react';
import { ClioStatus, type ClioStatusValue } from './status';
import { formatDuration } from '@/lib/format';

/** Shared transcript composition for tool and child-agent activity. */
export function ActivityRow({
  icon,
  title,
  detail,
  metadata,
  status,
  duration,
  attention,
  action,
  inlineDetail = false,
}: {
  icon: ReactNode;
  title: ReactNode;
  detail?: string;
  metadata?: ReactNode;
  status?: ClioStatusValue;
  duration?: number;
  /** Attention-mode badge (share of attention traced to this activity), when active. */
  attention?: ReactNode;
  action?: ReactNode;
  inlineDetail?: boolean;
}) {
  return (
    <span
      className="flex w-full min-w-0 items-center gap-1.5 py-0.5 text-[13px] leading-5"
      data-slot="activity-row"
    >
      <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center">
          <span className="min-w-0 max-w-full font-medium [overflow-wrap:anywhere]">{title}</span>
          {inlineDetail && detail ? (
            <span className="ml-2 min-w-0 truncate text-muted-foreground" title={detail}>
              {detail}
            </span>
          ) : null}
        </span>
        {detail && !inlineDetail ? (
          <span className="block text-xs leading-5 text-muted-foreground">{detail}</span>
        ) : null}
      </span>
      {metadata ? (
        <span
          className="min-w-0 max-w-[35%] truncate text-xs text-muted-foreground"
          data-slot="activity-metadata"
        >
          {metadata}
        </span>
      ) : null}
      {duration !== undefined ? (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatDuration(duration)}
        </span>
      ) : null}
      {status ? <ClioStatus compact value={status} className="shrink-0" /> : null}
      {attention ? <span className="shrink-0">{attention}</span> : null}
      {action ? (
        <span
          className={
            status ? 'flex size-5 shrink-0 items-center justify-center' : 'ml-auto shrink-0'
          }
        >
          {action}
        </span>
      ) : null}
    </span>
  );
}
