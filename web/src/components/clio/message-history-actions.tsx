import { GitForkIcon, LoaderCircleIcon, RewindIcon } from 'lucide-react';
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
import { IconButton } from './primitives/icon-button';

export interface ClioMessageHistoryActionsProps {
  forking?: boolean;
  rewinding?: boolean;
  onFork?: () => void | Promise<unknown>;
  onRewind?: () => void | Promise<unknown>;
}

export function ClioMessageHistoryActions({
  forking,
  rewinding,
  onFork,
  onRewind,
}: ClioMessageHistoryActionsProps) {
  const [confirmingRewind, setConfirmingRewind] = useState(false);
  const [localPending, setLocalPending] = useState<'fork' | 'rewind'>();

  const run = async (kind: 'fork' | 'rewind', action?: () => void | Promise<unknown>) => {
    if (!action) return false;
    setLocalPending(kind);
    try {
      await action();
      return true;
    } catch {
      // The route reports the authoritative service error.
      return false;
    } finally {
      setLocalPending(undefined);
    }
  };

  const forkPending = forking || localPending === 'fork';
  const rewindPending = rewinding || localPending === 'rewind';

  if (!onFork && !onRewind) return null;

  return (
    <>
      {onFork ? (
        <IconButton
          disabled={forkPending || rewindPending}
          icon={
            forkPending ? (
              <LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" />
            ) : (
              <GitForkIcon aria-hidden="true" />
            )
          }
          label={forkPending ? 'Forking into a new conversation' : 'Fork into a new conversation'}
          onClick={() => void run('fork', onFork)}
          size="sm"
          type="button"
        />
      ) : null}
      <IconButton
        disabled={!onRewind || forkPending || rewindPending}
        icon={<RewindIcon aria-hidden="true" />}
        label="Rewind to here"
        onClick={() => setConfirmingRewind(true)}
        size="sm"
        type="button"
      />
      <AlertDialog onOpenChange={setConfirmingRewind} open={confirmingRewind}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rewind this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove every later message from this conversation. The selected message remains as the
              new end. Files and artifacts already created or edited are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rewindPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={rewindPending}
              onClick={(event) => {
                event.preventDefault();
                void run('rewind', onRewind).then((succeeded) => {
                  if (succeeded) setConfirmingRewind(false);
                });
              }}
              variant="destructive"
            >
              {rewindPending ? 'Rewinding…' : 'Remove later messages'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
