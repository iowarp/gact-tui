import type { SourceOperation } from '@clio/core/v3';
import { useState } from 'react';
import { useCountUp } from '@/hooks/use-count-up';
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
import { CheckIcon, CircleAlertIcon, CircleIcon } from 'lucide-react';
import { sourceBytes } from './connected-source-labels';
import { RingSpinner } from './primitives/ring-spinner';
import { SourceStatusLine } from './source-form-parts';

/**
 * A download or index as the spec's status line: a spinner, one sentence and
 * Cancel. Cancelling still asks first and holds until the task settles.
 */
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
  const failed = operation.state === 'failed' || Boolean(operation.error);
  // Listing reports a page at a time; the count rises between reports instead of jumping.
  const entries = useCountUp(operation.entries_done, operation.id);
  const amount = indexing
    ? `${entries} ${entries === 1 ? 'entry' : 'entries'} indexed`
    : `${sourceBytes(operation.bytes_done)}${operation.bytes_total ? ` of ${sourceBytes(operation.bytes_total)}` : ''}`;
  const sentence = cancelling
    ? `Cancelling, ${amount}`
    : operation.state === 'completed'
      ? indexing
        ? `Folder index ready, ${amount}`
        : `Downloaded to workspace Files, ${amount}`
      : active
        ? indexing
          ? `Indexing, ${amount}`
          : `Downloading ${amount}`
        : `${indexing ? 'Indexing' : 'Download'} ${operation.state}, ${amount}`;
  return (
    <div role="status" className="flex min-w-0 flex-col gap-1">
      <SourceStatusLine
        tone={failed ? 'error' : operation.state === 'completed' ? 'ok' : 'default'}
        icon={
          active ? (
            <RingSpinner />
          ) : failed ? (
            <CircleAlertIcon />
          ) : operation.state === 'completed' ? (
            <CheckIcon />
          ) : (
            <CircleIcon />
          )
        }
        actions={
          active ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[12px]"
              disabled={cancelling}
              onClick={() => setConfirm(true)}
            >
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </Button>
          ) : undefined
        }
      >
        {sentence}
      </SourceStatusLine>
      {active && (
        <progress
          className="ml-[22px] h-1 w-[calc(100%-22px)] accent-primary"
          aria-label={indexing ? 'Indexing progress' : 'Transfer progress'}
          value={!indexing && operation.bytes_total ? operation.bytes_done : undefined}
          max={!indexing && operation.bytes_total ? operation.bytes_total : undefined}
        />
      )}
      {operation.error && (
        <p className="pl-[22px] text-[11.5px] leading-[1.45] text-destructive">{operation.error}</p>
      )}
      {operation.native_job_id && (
        <p
          className="truncate pl-[22px] font-mono text-[11px] text-faint"
          title={operation.native_job_id}
        >
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
