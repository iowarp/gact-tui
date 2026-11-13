import type { Session } from '@clio/core/v3';
import {
  ArchiveIcon,
  GitForkIcon,
  PackageOpenIcon,
  PinIcon,
  PinOffIcon,
  Share2Icon,
  Undo2Icon,
} from 'lucide-react';
import { DeleteIcon, EditIcon } from '@/lib/icon-vocabulary';
import { KeyMenuItem } from './menu-key-items';
import type { ResourceActions, ResourceTarget } from './resource-dialogs';
import type { SessionHistoryConfirmation } from './session-history-confirm-dialog';
import { t } from '@lingui/core/macro';

export interface SessionManagementMenuProps {
  session: Session;
  actions: ResourceActions;
  onRename: (target: ResourceTarget) => void;
  onDelete: (target: ResourceTarget) => void;
  onAction: (action: () => Promise<void>, success: string) => void;
}

/** Shared conversation identity rows for the title and left bar menus. */
export function SessionOrganizeMenuItems({
  session,
  actions,
  onRename,
  onAction,
}: Pick<SessionManagementMenuProps, 'session' | 'actions' | 'onRename' | 'onAction'>) {
  return (
    <>
      <KeyMenuItem
        icon={session.pinned ? PinOffIcon : PinIcon}
        label={session.pinned ? t`Unpin` : t`Pin`}
        menuKey="P"
        onSelect={() =>
          onAction(
            () => actions.setSessionPinned(session.id, !session.pinned),
            session.pinned ? t`Conversation unpinned` : t`Conversation pinned`,
          )
        }
      />
      <KeyMenuItem
        icon={EditIcon}
        label={t`Rename`}
        menuKey="R"
        onSelect={() => onRename({ kind: 'session', id: session.id, label: session.title })}
      />
    </>
  );
}

/** Fork, shared by the title and left bar menus so both name it the same way. */
export function SessionForkMenuItem({ onSelect }: { onSelect: () => void }) {
  return (
    <KeyMenuItem
      icon={GitForkIcon}
      label={t`Fork into a new conversation`}
      menuKey="F"
      onSelect={onSelect}
    />
  );
}

/** Share, shared by the title and left bar menus; it opens the share dialog. */
export function SessionShareMenuItem({ onSelect }: { onSelect: () => void }) {
  return (
    <KeyMenuItem
      icon={Share2Icon}
      label={t`Share read-only link`}
      menuKey="L"
      onSelect={onSelect}
    />
  );
}

/** Compact and Remove last, shared by the title and left bar menus; each opens its confirmation. */
export function SessionHistoryMenuItems({
  onConfirm,
}: {
  onConfirm: (confirmation: SessionHistoryConfirmation) => void;
}) {
  return (
    <>
      <KeyMenuItem
        icon={PackageOpenIcon}
        label={t`Compact conversation…`}
        menuKey="C"
        onSelect={() => onConfirm('compact')}
      />
      <KeyMenuItem
        icon={Undo2Icon}
        label={t`Remove last message…`}
        menuKey="V"
        onSelect={() => onConfirm('undo')}
        destructive
      />
    </>
  );
}

/** Archive and delete use the same service actions and confirmation entry point. */
export function SessionLifecycleMenuItems({
  session,
  actions,
  onDelete,
  onAction,
}: Pick<SessionManagementMenuProps, 'session' | 'actions' | 'onDelete' | 'onAction'>) {
  return (
    <>
      <KeyMenuItem
        icon={ArchiveIcon}
        label={t`Archive`}
        menuKey="A"
        onSelect={() =>
          onAction(() => actions.archiveSession(session.id), t`Conversation archived`)
        }
      />
      <KeyMenuItem
        icon={DeleteIcon}
        label={t`Delete…`}
        menuKey="D"
        onSelect={() => onDelete({ kind: 'session', id: session.id, label: session.title })}
        destructive
      />
    </>
  );
}
