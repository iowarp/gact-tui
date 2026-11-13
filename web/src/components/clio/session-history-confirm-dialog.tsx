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
import { t } from '@lingui/core/macro';

export type SessionHistoryConfirmation = 'compact' | 'undo';

/** The one confirmation for Compact and Remove last, from the title or the left bar menu. */
export function SessionHistoryConfirmDialog({
  confirmation,
  pending,
  onCancel,
  onConfirm,
}: {
  confirmation: SessionHistoryConfirmation | undefined;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
      open={confirmation !== undefined}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {confirmation === 'compact' ? t`Compact this conversation?` : t`Remove last message?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirmation === 'compact'
              ? t`The service appends a checkpoint; earlier messages stay in the transcript. Export the session first if you need a portable copy of every message.`
              : t`The service will permanently remove the last stored message from this session. This action follows the connected permission policy.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t`Cancel`}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            variant={confirmation === 'undo' ? 'destructive' : 'default'}
          >
            {pending
              ? t`Working…`
              : confirmation === 'compact'
                ? t`Compact conversation`
                : t`Remove message`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
