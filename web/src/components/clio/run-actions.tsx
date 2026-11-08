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

/** Stop and the run's menu, sized for a row's hover action column. */
export function RunActions({
  onCancel,
  pending,
  row,
}: {
  onCancel: () => void;
  pending: boolean;
  row: RunRow;
}) {
  const cancellable = row.cancellable;
  const href = runConversationHref(row);
  return (
    <div className="flex items-center gap-0.5">
      {cancellable && (
        <NamedTooltip label={row.cancelRequested ? 'Cancellation requested' : 'Stop'}>
          <Button
            aria-label={`Cancel ${row.taskKind ?? 'task'}: ${row.assignment || row.label}`}
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
        <NamedTooltip label="More">
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Actions for ${row.label}`}
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
          <DropdownMenuLabel>Run actions</DropdownMenuLabel>
          {href ? (
            <DropdownMenuItem asChild>
              <Link to={href}>{row.flowHandle ? 'Open flow run' : 'Open conversation'}</Link>
            </DropdownMenuItem>
          ) : null}
          {row.flowHandle && href ? (
            <DropdownMenuItem asChild>
              <Link to={runConversationHref(row, false) ?? href}>Open conversation</Link>
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
                {row.cancelRequested ? 'Cancellation requested' : 'Cancel task…'}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
