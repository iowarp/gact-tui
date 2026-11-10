import { useShortcut } from '@/lib/shortcuts/hooks';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { ExternalLinkIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Session } from '@clio/core/v3';
import { toast } from 'sonner';
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
import {
  SessionHistoryConfirmDialog,
  type SessionHistoryConfirmation,
} from './session-history-confirm-dialog';
import {
  SessionForkMenuItem,
  SessionHistoryMenuItems,
  SessionLifecycleMenuItems,
  SessionOrganizeMenuItems,
  SessionShareMenuItem,
} from './session-management-menu';
import { TopBarEnd } from './top-bar-end';

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
  /**
   * A second trigger for the same menu at the end of the top bar (the ⋯). Alt . opens the
   * menu from it when it is there.
   */
  more?: (state: { disabled: boolean }) => ReactNode;
}

export function ClioSessionActions({
  title,
  trigger,
  more,
  disabled,
  management,
  onFork,
  onCompact,
  onOpenSystemTerminal,
  onShare,
  onUndo,
}: ClioSessionActionsProps) {
  const [confirmation, setConfirmation] = useState<SessionHistoryConfirmation>();
  const [sharing, setSharing] = useState(false);
  const [pending, setPending] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ResourceTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResourceTarget | null>(null);
  const [openMenu, setOpenMenu] = useState<'trigger' | 'more'>();
  useShortcut('conversation-menu', () => setOpenMenu(more ? 'more' : 'trigger'), {
    enabled: !disabled && !pending,
  });
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
  const items = (
    <>
      {management ? (
        <SessionOrganizeMenuItems
          actions={management.actions}
          onAction={runManagementAction}
          onRename={setRenameTarget}
          session={management.session}
        />
      ) : null}
      {onFork ? <SessionForkMenuItem onSelect={() => void run(onFork)} /> : null}
      <SessionShareMenuItem onSelect={() => setSharing(true)} />
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
          icon={ExternalLinkIcon}
          label="Open in system terminal"
          menuKey="T"
          onSelect={() => void run(onOpenSystemTerminal)}
        />
      ) : null}
      <SessionHistoryMenuItems onConfirm={setConfirmation} />
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
    </>
  );
  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => setOpenMenu(open ? 'trigger' : undefined)}
        open={openMenu === 'trigger'}
      >
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
        <DropdownMenuContent
          align={trigger ? 'start' : 'end'}
          className="w-[290px]"
          onKeyDown={selectMenuKey}
        >
          {items}
        </DropdownMenuContent>
      </DropdownMenu>
      {more ? (
        <DropdownMenu
          onOpenChange={(open) => setOpenMenu(open ? 'more' : undefined)}
          open={openMenu === 'more'}
        >
          <TopBarEnd>
            <DropdownMenuTrigger asChild>
              {more({ disabled: Boolean(disabled || pending) })}
            </DropdownMenuTrigger>
          </TopBarEnd>
          <DropdownMenuContent align="end" className="w-[290px]" onKeyDown={selectMenuKey}>
            {items}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <SessionHistoryConfirmDialog
        confirmation={confirmation}
        onCancel={() => setConfirmation(undefined)}
        onConfirm={() => void confirm()}
        pending={pending}
      />
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
