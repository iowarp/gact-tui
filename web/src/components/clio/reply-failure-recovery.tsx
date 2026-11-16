import { CopyPlusIcon, RewindIcon } from 'lucide-react';
import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { t } from '@lingui/core/macro';
import type { ReplyRecoveryPoint } from './reply-failure';

/**
 * The ways out of a conversation whose saved history can't be read: go back to the
 * last reply before the damaged part (the existing rewind), or continue in a copy
 * (the existing fork, which starts from the readable transcript).
 */
export function ReplyRecoveryActions({
  point,
  onRewindToMessage,
  onForkFromMessage,
}: {
  point: ReplyRecoveryPoint;
  onRewindToMessage?: (messageId: string) => void | Promise<unknown>;
  onForkFromMessage?: (messageId: string) => void | Promise<unknown>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<'rewind' | 'copy'>();
  const { rewindTo, copyFrom } = point;
  const run = async (kind: 'rewind' | 'copy', action: () => void | Promise<unknown>) => {
    setPending(kind);
    try {
      await action();
      return true;
    } catch {
      return false; // The mutation reports the service's error.
    } finally {
      setPending(undefined);
    }
  };
  const canRewind = Boolean(rewindTo && onRewindToMessage);
  const canCopy = Boolean(copyFrom && onForkFromMessage);
  if (!canRewind && !canCopy) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" data-slot="reply-recovery">
      {canRewind ? (
        <Button
          disabled={pending !== undefined}
          onClick={() => setConfirming(true)}
          size="xs"
          variant="outline"
        >
          <RewindIcon aria-hidden="true" />
          {t`Go back to the last reply that worked`}
        </Button>
      ) : null}
      {canCopy ? (
        <Button
          disabled={pending !== undefined}
          onClick={() => void run('copy', () => onForkFromMessage!(copyFrom!))}
          size="xs"
          variant="outline"
        >
          <CopyPlusIcon aria-hidden="true" />
          {pending === 'copy' ? t`Making a copy…` : t`Continue in a copy`}
        </Button>
      ) : null}
      <AlertDialog onOpenChange={setConfirming} open={confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Go back to the last reply that worked?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`The messages after that reply are removed from this conversation, including the ones that failed. Files and artifacts already created or edited are kept.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending === 'rewind'}>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending === 'rewind'}
              onClick={(event) => {
                event.preventDefault();
                void run('rewind', () => onRewindToMessage!(rewindTo!)).then((done) => {
                  if (done) setConfirming(false);
                });
              }}
              variant="destructive"
            >
              {pending === 'rewind' ? t`Going back…` : t`Go back`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
