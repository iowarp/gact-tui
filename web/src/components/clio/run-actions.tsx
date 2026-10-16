import { Link } from 'react-router-dom';
import { CloseIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import type { RunRow } from '@/routes/runs-page';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  return (
    <div className="flex items-center gap-1">
      {cancellable && (
        <Button
          aria-label={`Cancel ${row.taskKind ?? 'task'}: ${row.assignment || row.label}`}
          disabled={Boolean(pending || row.cancelRequested)}
          size="icon-sm"
          variant="ghost"
          onClick={onCancel}
        >
          <CloseIcon aria-hidden="true" />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Actions for ${row.label}`}
            disabled={pending}
            size="icon-sm"
            variant="outline"
          >
            <MoreIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Run actions</DropdownMenuLabel>
          {row.workspaceId && row.targetSessionId ? (
            <DropdownMenuItem asChild>
              <Link
                to={`${`/workspaces/${encodeURIComponent(row.workspaceId)}/sessions/${encodeURIComponent(row.targetSessionId)}`}${row.workflow ? `?workflow=${encodeURIComponent(row.workflow.id)}` : ''}`}
              >
                {row.workflow ? 'Open workflow graph' : 'Open conversation'}
              </Link>
            </DropdownMenuItem>
          ) : null}
          {row.workflow && row.workspaceId && row.targetSessionId ? (
            <DropdownMenuItem asChild>
              <Link
                to={`/workspaces/${encodeURIComponent(row.workspaceId)}/sessions/${encodeURIComponent(row.targetSessionId)}`}
              >
                Open conversation
              </Link>
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
