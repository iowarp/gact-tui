import type { FleetSpend } from '@clio/core/v3';
import type { ReactNode } from 'react';
import { spendDetails, spendLabel } from '@/lib/fleet-usage';
import { cn } from '@/lib/utils';
import { ItemRow } from './primitives/item-row';

/** One width per column across every usage list, so figures line up down the page. */
const USAGE_COLUMNS = { statusWidth: 140, actionsWidth: 96, slotWidth: 52 } as const;

/** A figure in the status column, right-aligned with its full text on hover. */
export function UsageFigure({ children, className }: { children: string; className?: string }) {
  return (
    <span
      className={cn(
        'w-full min-w-0 truncate text-right text-xs text-muted-foreground tabular-nums',
        className,
      )}
      title={children}
    >
      {children}
    </span>
  );
}

/** Recorded spend: tokens in the status column, cost at the right. */
export function SpendRow({
  title,
  icon,
  meta,
  spend,
  size,
}: {
  title: string;
  icon?: ReactNode;
  meta?: string;
  spend: FleetSpend;
  size?: 'sm';
}) {
  const { tokens, cost } = spendDetails(spend);
  return (
    <ItemRow
      {...USAGE_COLUMNS}
      actions={cost ? <UsageFigure className="text-foreground">{cost}</UsageFigure> : null}
      actionsVisible
      aria-label={`${title}: ${spendLabel(spend)}`}
      icon={icon}
      meta={meta}
      size={size}
      slot={null}
      status={<UsageFigure>{tokens}</UsageFigure>}
      title={<span title={title}>{title}</span>}
    />
  );
}
