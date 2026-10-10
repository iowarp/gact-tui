import type { SourceOperation } from '@clio/core/v3';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { sourceBytes } from './connected-source-labels';

/** Storage controls confirm cancellation and retain pending ownership until settlement. */
export function SourceOperationStatus({
  operation,
  label,
  pending,
  onCancel,
}: {
  operation: SourceOperation;
  label: string;
  pending: boolean;
  onCancel: () => Promise<unknown> | void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [requestedId, setRequestedId] = useState<string>();
  const indexing = operation.kind === 'indexing';
  const active = ['queued', 'running'].includes(operation.state);
  const cancelling =
    active && (operation.cancel_requested || pending || requestedId === operation.id);
  return (
    <div className="space-y-2 rounded-md border p-3" role="status">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>
          {cancelling
            ? 'Cancellation requested'
            : operation.state === 'completed'
              ? indexing
                ? 'Folder index ready'
                : 'Downloaded to workspace Files'
              : operation.state}
          :{' '}
          {indexing
            ? `${operation.entries_done} entries indexed`
            : `${sourceBytes(operation.bytes_done)}${operation.bytes_total ? ` / ${sourceBytes(operation.bytes_total)}` : ''}`}
        </span>
        {active && (
          <Button size="sm" variant="ghost" disabled={cancelling} onClick={() => setConfirm(true)}>
            {cancelling
              ? 'Cancellation requested'
              : indexing
                ? 'Cancel indexing'
                : 'Cancel transfer'}
          </Button>
        )}
      </div>
      {active && (
        <progress
          className="h-1.5 w-full accent-primary"
          aria-label={indexing ? 'Indexing progress' : 'Transfer progress'}
          value={!indexing && operation.bytes_total ? operation.bytes_done : undefined}
          max={!indexing && operation.bytes_total ? operation.bytes_total : undefined}
        />
      )}
      {operation.error && <p className="text-xs text-destructive">{operation.error}</p>}
      {operation.native_job_id && (
        <p className="break-all text-xs text-muted-foreground">
          Globus task {operation.native_job_id}
        </p>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {indexing ? 'indexing' : 'download'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Cancel {indexing ? 'indexing' : 'downloading'} “{label}”? Cleanup must finish before
              this task settles.
              {indexing ? ' The previous folder index will remain available.' : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep running</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (cancelling) return;
                setRequestedId(operation.id);
                Promise.resolve(onCancel()).catch(() => setRequestedId(undefined));
              }}
            >
              Cancel task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
