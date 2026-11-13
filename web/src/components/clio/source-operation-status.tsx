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
import { ph, plural, t } from '@lingui/core/macro';

/**
 * A download or index as the spec's status line: a spinner, one sentence and
 * Cancel. Cancelling still asks first and holds until the task settles.
 */
/** "Indexing failed, 120 entries indexed": a stopped operation with what it reached. */
function stoppedSentence(indexing: boolean, state: string, amount: string): string {
  if (indexing) {
    if (state === 'failed') return t`Indexing failed, ${amount}`;
    if (state === 'cancelled') return t`Indexing cancelled, ${amount}`;
    if (state === 'interrupted') return t`Indexing interrupted, ${amount}`;
    return t`Indexing ${state}, ${amount}`;
  }
  if (state === 'failed') return t`Download failed, ${amount}`;
  if (state === 'cancelled') return t`Download cancelled, ${amount}`;
  if (state === 'interrupted') return t`Download interrupted, ${amount}`;
  return t`Download ${state}, ${amount}`;
}

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
    ? plural(entries, { one: '# entry indexed', other: '# entries indexed' })
    : operation.bytes_total
      ? t`${ph({ done: sourceBytes(operation.bytes_done) })} of ${ph({ total: sourceBytes(operation.bytes_total) })}`
      : sourceBytes(operation.bytes_done);
  const sentence = cancelling
    ? t`Cancelling, ${amount}`
    : operation.state === 'completed'
      ? indexing
        ? t`Folder index ready, ${amount}`
        : t`Downloaded to workspace Files, ${amount}`
      : active
        ? indexing
          ? t`Indexing, ${amount}`
          : t`Downloading ${amount}`
        : stoppedSentence(indexing, operation.state, amount);
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
              className="h-6 px-2 text-meta"
              disabled={cancelling}
              onClick={() => setConfirm(true)}
            >
              {cancelling ? t`Cancelling…` : t`Cancel`}
            </Button>
          ) : undefined
        }
      >
        {sentence}
      </SourceStatusLine>
      {active && (
        <progress
          className="ml-[22px] h-1 w-[calc(100%-22px)] accent-primary"
          aria-label={indexing ? t`Indexing progress` : t`Transfer progress`}
          value={!indexing && operation.bytes_total ? operation.bytes_done : undefined}
          max={!indexing && operation.bytes_total ? operation.bytes_total : undefined}
        />
      )}
      {operation.error && (
        <p className="pl-[22px] text-label leading-[1.45] text-destructive">{operation.error}</p>
      )}
      {operation.native_job_id && (
        <p
          className="truncate pl-[22px] font-mono text-caption text-faint"
          title={operation.native_job_id}
        >
          {t`Globus task ${ph({ native_job_id: operation.native_job_id })}`}
        </p>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {indexing ? t`Cancel indexing?` : t`Cancel download?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {indexing
                ? t`Cancel indexing “${label}”? Cleanup must finish before this task settles. The previous folder index will remain available.`
                : t`Cancel downloading “${label}”? Cleanup must finish before this task settles.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Keep running`}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (cancelling) return;
                setRequestedId(operation.id);
                Promise.resolve(onCancel()).catch(() => setRequestedId(undefined));
              }}
            >
              {t`Cancel task`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
