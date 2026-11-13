import { CircleStopIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { NamedTooltip } from '@/components/clio/primitives/icon-button';
import { runConversationHref } from '@/components/clio/run-presentation';
import type { RunRow } from '@/routes/runs-rows';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { t, ph } from '@lingui/core/macro';

/**
 * Stop and the run's menu, sized for a row's hover action column. `menu` leaves
 * Stop out for a run tab, whose frame bar draws Stop before its rule.
 */
export function RunActions({
  onCancel,
  pending,
  row,
  part = 'all',
}: {
  onCancel: () => void;
  pending: boolean;
  row: RunRow;
  part?: 'all' | 'menu';
}) {
  const cancellable = row.cancellable;
  const href = runConversationHref(row);
  return (
    <div className="flex items-center gap-0.5">
      {cancellable && part === 'all' && (
        <NamedTooltip label={row.cancelRequested ? t`Cancellation requested` : t`Stop`}>
          <Button
            aria-label={
              row.taskKind
                ? t`Cancel ${ph({ kind: row.taskKind })}: ${ph({ task: row.assignment || row.label })}`
                : t`Cancel task: ${ph({ task: row.assignment || row.label })}`
            }
            className="text-muted-foreground hover:bg-hover hover:text-destructive"
            disabled={Boolean(pending || row.cancelRequested)}
            size="icon-xs"
            variant="ghost"
            onClick={onCancel}
          >
            <CircleStopIcon aria-hidden="true" />
          </Button>
        </NamedTooltip>
      )}
      <DropdownMenu>
        <NamedTooltip label={t`More`}>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t`Actions for ${ph({ label: row.label })}`}
              className="text-muted-foreground hover:bg-hover hover:text-foreground"
              disabled={pending}
              size="icon-xs"
              variant="ghost"
            >
              <MoreIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </NamedTooltip>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>{t`Run actions`}</DropdownMenuLabel>
          {href ? (
            <DropdownMenuItem asChild>
              <Link to={href}>{row.flowHandle ? t`Open flow run` : t`Open conversation`}</Link>
            </DropdownMenuItem>
          ) : null}
          {row.flowHandle && href ? (
            <DropdownMenuItem asChild>
              <Link to={runConversationHref(row, false) ?? href}>{t`Open conversation`}</Link>
            </DropdownMenuItem>
          ) : null}
          {cancellable ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={row.cancelRequested}
                onSelect={onCancel}
                variant="destructive"
              >
                {row.cancelRequested ? t`Cancellation requested` : t`Cancel task…`}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
