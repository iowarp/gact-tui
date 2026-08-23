import {
  GitForkIcon,
  MoreHorizontalIcon,
  PackageOpenIcon,
  Share2Icon,
  Undo2Icon,
} from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ClioShareSessionDialog } from './share-session-dialog';

export interface ClioSessionActionsProps {
  title: string;
  disabled?: boolean;
  onFork: () => Promise<void>;
  onCompact: () => Promise<void>;
  onShare: (ttlSeconds: number) => Promise<string>;
  onUndo: () => Promise<void>;
}

export function ClioSessionActions({
  title,
  disabled,
  onFork,
  onCompact,
  onShare,
  onUndo,
}: ClioSessionActionsProps) {
  const [confirmation, setConfirmation] = useState<'compact' | 'undo'>();
  const [sharing, setSharing] = useState(false);
  const [pending, setPending] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setPending(true);
    try {
      await action();
      return true;
    } catch {
      // The route owns the user-facing error toast. Keep this interaction
      // boundary from producing an unhandled rejection.
      return false;
    } finally {
      setPending(false);
    }
  };
  const confirm = async () => {
    const succeeded = await run(confirmation === 'compact' ? onCompact : onUndo);
    if (succeeded) {
      setConfirmation(undefined);
    }
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Actions for ${title}`}
            disabled={disabled || pending}
            size="icon-xs"
            variant="ghost"
          >
            <MoreHorizontalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void run(onFork)}>
            <GitForkIcon aria-hidden="true" /> Branch into a new session
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSharing(true)}>
            <Share2Icon aria-hidden="true" /> Share read-only link
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setConfirmation('compact')}>
            <PackageOpenIcon aria-hidden="true" /> Compact conversation
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirmation('undo')} variant="destructive">
            <Undo2Icon aria-hidden="true" /> Remove last message
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !pending) setConfirmation(undefined);
        }}
        open={confirmation !== undefined}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation === 'compact' ? 'Compact this conversation?' : 'Remove last message?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation === 'compact'
                ? 'The service will replace the visible transcript with an evidence-preserving compact summary. Export the session first if you need a portable copy of every message.'
                : 'The service will permanently remove the last stored message from this session. This action follows the connected permission policy.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                void confirm();
              }}
              variant={confirmation === 'undo' ? 'destructive' : 'default'}
            >
              {pending
                ? 'Working…'
                : confirmation === 'compact'
                  ? 'Compact conversation'
                  : 'Remove message'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ClioShareSessionDialog
        onOpenChange={setSharing}
        onShare={onShare}
        open={sharing}
        title={title}
      />
    </>
  );
}
