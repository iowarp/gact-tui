import {
  ExternalLinkIcon,
  GitForkIcon,
  PackageOpenIcon,
  Share2Icon,
  Undo2Icon,
} from 'lucide-react';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { useState } from 'react';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { KeyMenuItem } from './menu-key-items';
import { selectMenuKey } from './select-menu-key';
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
}

export function ClioSessionActions({
  title,
  disabled,
  management,
  onFork,
  onCompact,
  onOpenSystemTerminal,
  onShare,
  onUndo,
}: ClioSessionActionsProps) {
  const [confirmation, setConfirmation] = useState<'compact' | 'undo'>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pending, setPending] = useState(false);
  useShortcut('conversation-menu', () => setMenuOpen(true), {
    enabled: !(disabled || pending),
  });
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
      <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Actions for ${title}`}
            className="max-sm:size-8"
            disabled={disabled || pending}
            size="icon-xs"
            variant="ghost"
          >
            <MoreIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64" onKeyDown={selectMenuKey}>
          {management ? (
            <SessionOrganizeMenuItems
              actions={management.actions}
              onAction={runManagementAction}
              onRename={setRenameTarget}
              session={management.session}
            />
          ) : null}
          {onFork ? (
            <KeyMenuItem
              icon={<GitForkIcon aria-hidden="true" />}
              label="Fork into a new conversation"
              menuKey="F"
              onSelect={() => void run(onFork)}
            />
          ) : null}
          <KeyMenuItem
            icon={<Share2Icon aria-hidden="true" />}
            label="Share read-only link"
            menuKey="L"
            onSelect={() => setSharing(true)}
          />
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
            <KeyMenuItem
              icon={<ExternalLinkIcon aria-hidden="true" />}
              label="Open in system terminal"
              menuKey="T"
              onSelect={() => void run(onOpenSystemTerminal)}
            />
          ) : null}
          <KeyMenuItem
            icon={<PackageOpenIcon aria-hidden="true" />}
            label="Compact conversation…"
            menuKey="C"
            onSelect={() => setConfirmation('compact')}
          />
          <KeyMenuItem
            icon={<Undo2Icon aria-hidden="true" />}
            label="Remove last message…"
            menuKey="V"
            onSelect={() => setConfirmation('undo')}
            destructive
          />
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
