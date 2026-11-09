import {
  ExternalLinkIcon,
  GitForkIcon,
  PackageOpenIcon,
  Share2Icon,
  Undo2Icon,
} from 'lucide-react';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { useState, type ReactNode } from 'react';
import type { Session } from '@clio/core/v3';
import { toast } from 'sonner';
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
import {
  DeleteResourceDialog,
  RenameResourceDialog,
  type ResourceActions,
  type ResourceTarget,
} from './resource-dialogs';
import { downloadSessionExport } from './session-export-download';
import { SessionExportMenu } from './session-export-menu';
import { SessionLifecycleMenuItems, SessionOrganizeMenuItems } from './session-management-menu';

export interface ClioSessionActionsProps {
  title: string;
  disabled?: boolean;
  management?: { session: Session; actions: ResourceActions; endpoint: string };
  onFork?: () => Promise<void>;
  onCompact: () => Promise<void>;
  /** Secondary escape hatch to the OS's own terminal app. Undefined hides
   * the menu item (browser hosts, or a workspace with no known path). */
  onOpenSystemTerminal?: () => Promise<void>;
  onShare: (ttlSeconds: number) => Promise<string>;
  onUndo: () => Promise<void>;
  /**
   * Replaces the More button, e.g. with the top bar's title and chevron. It must be a button
   * that forwards props; it gets the menu's open state and `disabled`.
   */
  trigger?: (state: { disabled: boolean }) => ReactNode;
}

export function ClioSessionActions({
  title,
  trigger,
  disabled,
  management,
  onFork,
  onCompact,
  onOpenSystemTerminal,
  onShare,
  onUndo,
}: ClioSessionActionsProps) {
  const [confirmation, setConfirmation] = useState<'compact' | 'undo'>();
  const [sharing, setSharing] = useState(false);
  const [pending, setPending] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ResourceTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResourceTarget | null>(null);
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
  const runManagementAction = (action: () => Promise<void>, success: string) => {
    void run(async () => {
      try {
        await action();
        toast.success(success);
      } catch (reason) {
        toast.error(reason instanceof Error ? reason.message : String(reason), {
          duration: Infinity,
          closeButton: true,
        });
        throw reason;
      }
    });
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ? (
            trigger({ disabled: Boolean(disabled || pending) })
          ) : (
            <Button
              aria-label={`Actions for ${title}`}
              className="max-sm:size-8"
              disabled={disabled || pending}
              size="icon-xs"
              variant="ghost"
            >
              <MoreIcon aria-hidden="true" />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={trigger ? 'start' : 'end'} className="w-[290px]">
          {management ? (
            <>
              <SessionOrganizeMenuItems
                actions={management.actions}
                onAction={runManagementAction}
                onRename={setRenameTarget}
                session={management.session}
              />
              <DropdownMenuSeparator />
            </>
          ) : null}
          {onFork ? (
            <DropdownMenuItem menuKey="F" onSelect={() => void run(onFork)}>
              <GitForkIcon aria-hidden="true" /> Fork into a new conversation
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem menuKey="L" onSelect={() => setSharing(true)}>
            <Share2Icon aria-hidden="true" /> Share read-only link
          </DropdownMenuItem>
          {management ? (
            <SessionExportMenu
              onExport={(mode) =>
                runManagementAction(
                  () =>
                    downloadSessionExport(
                      management.actions,
                      management.endpoint,
                      management.session.id,
                      title,
                      mode,
                    ),
                  'Session archive prepared for download',
                )
              }
            />
          ) : null}
          <DropdownMenuSeparator />
          {onOpenSystemTerminal ? (
            <DropdownMenuItem menuKey="T" onSelect={() => void run(onOpenSystemTerminal)}>
              <ExternalLinkIcon aria-hidden="true" /> Open in system terminal
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem menuKey="C" onSelect={() => setConfirmation('compact')}>
            <PackageOpenIcon aria-hidden="true" /> Compact conversation…
          </DropdownMenuItem>
          <DropdownMenuItem
            menuKey="V"
            onSelect={() => setConfirmation('undo')}
            variant="destructive"
          >
            <Undo2Icon aria-hidden="true" /> Remove last message…
          </DropdownMenuItem>
          {management ? (
            <>
              <DropdownMenuSeparator />
              <SessionLifecycleMenuItems
                actions={management.actions}
                onAction={runManagementAction}
                onDelete={setDeleteTarget}
                session={management.session}
              />
            </>
          ) : null}
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
                ? 'The service appends a checkpoint; earlier messages stay in the transcript. Export the session first if you need a portable copy of every message.'
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
      {management && renameTarget ? (
        <RenameResourceDialog
          actions={management.actions}
          key={`rename:${renameTarget.id}`}
          onClose={() => setRenameTarget(null)}
          target={renameTarget}
        />
      ) : null}
      {management && deleteTarget ? (
        <DeleteResourceDialog
          actions={management.actions}
          key={`delete:${deleteTarget.id}`}
          onClose={() => setDeleteTarget(null)}
          target={deleteTarget}
        />
      ) : null}
      <ClioShareSessionDialog
        onOpenChange={setSharing}
        onShare={onShare}
        open={sharing}
        title={title}
      />
    </>
  );
}
