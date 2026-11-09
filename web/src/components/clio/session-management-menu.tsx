import type { Session } from '@clio/core/v3';
import { ArchiveIcon, PinIcon, PinOffIcon } from 'lucide-react';
import { DeleteIcon, EditIcon } from '@/lib/icon-vocabulary';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { ResourceActions, ResourceTarget } from './resource-dialogs';

export interface SessionManagementMenuProps {
  session: Session;
  actions: ResourceActions;
  onRename: (target: ResourceTarget) => void;
  onDelete: (target: ResourceTarget) => void;
  onAction: (action: () => Promise<void>, success: string) => void;
}

/** Pin and Rename, shared by the breadcrumb and left-bar conversation menus. */
export function SessionOrganizeMenuItems({
  session,
  actions,
  onRename,
  onAction,
}: Pick<SessionManagementMenuProps, 'session' | 'actions' | 'onRename' | 'onAction'>) {
  return (
    <>
      <DropdownMenuItem
        menuKey="P"
        onSelect={() =>
          onAction(
            () => actions.setSessionPinned(session.id, !session.pinned),
            session.pinned ? 'Conversation unpinned' : 'Conversation pinned',
          )
        }
      >
        {session.pinned ? <PinOffIcon aria-hidden="true" /> : <PinIcon aria-hidden="true" />}
        {session.pinned ? 'Unpin' : 'Pin'}
      </DropdownMenuItem>
      <DropdownMenuItem
        menuKey="R"
        onSelect={() => onRename({ kind: 'session', id: session.id, label: session.title })}
      >
        <EditIcon aria-hidden="true" /> Rename
      </DropdownMenuItem>
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
      <DropdownMenuItem
        menuKey="A"
        onSelect={() => onAction(() => actions.archiveSession(session.id), 'Conversation archived')}
      >
        <ArchiveIcon aria-hidden="true" /> Archive
      </DropdownMenuItem>
      <DropdownMenuItem
        menuKey="D"
        onSelect={() => onDelete({ kind: 'session', id: session.id, label: session.title })}
        variant="destructive"
      >
        <DeleteIcon aria-hidden="true" /> Delete…
      </DropdownMenuItem>
    </>
  );
}
