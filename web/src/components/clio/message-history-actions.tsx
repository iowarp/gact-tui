import { GitForkIcon, LoaderCircleIcon, RewindIcon } from 'lucide-react';
import { useState } from 'react';
import { MessageAction } from '@/components/ai-elements/message';
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
      <MessageAction
        disabled={!onFork || forkPending || rewindPending}
        label={forkPending ? 'Branching from this message' : 'Branch from here'}
        onClick={() => void run('fork', onFork)}
        tooltip={forkPending ? 'Branching from this message' : 'Branch from here'}
      >
        {forkPending ? (
          <LoaderCircleIcon aria-hidden="true" className="size-3.5 animate-spin" />
        ) : (
          <GitForkIcon aria-hidden="true" className="size-3.5" />
        )}
      </MessageAction>
      <MessageAction
        disabled={!onRewind || forkPending || rewindPending}
        label="Rewind to here"
        onClick={() => setConfirmingRewind(true)}
        tooltip="Rewind to here"
      >
        <RewindIcon aria-hidden="true" className="size-3.5" />
      </MessageAction>
      <AlertDialog onOpenChange={setConfirmingRewind} open={confirmingRewind}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rewind this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              The service will permanently remove every message after this point. The selected
              message remains as the new end of the conversation.
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
