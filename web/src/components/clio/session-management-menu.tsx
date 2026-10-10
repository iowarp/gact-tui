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

/** Shared session identity actions for the header and navigation menus. */
export function SessionOrganizeMenuItems({
  session,
  actions,
  onRename,
  onAction,
}: Pick<SessionManagementMenuProps, 'session' | 'actions' | 'onRename' | 'onAction'>) {
  return (
    <>
      <DropdownMenuItem
        className="whitespace-nowrap"
        onSelect={() => onRename({ kind: 'session', id: session.id, label: session.title })}
      >
        <EditIcon aria-hidden="true" /> Rename session
      </DropdownMenuItem>
      <DropdownMenuItem
        className="whitespace-nowrap"
        onSelect={() =>
          onAction(
            () => actions.setSessionPinned(session.id, !session.pinned),
            session.pinned ? 'Session unpinned' : 'Session pinned',
          )
        }
      >
        {session.pinned ? <PinOffIcon aria-hidden="true" /> : <PinIcon aria-hidden="true" />}
        {session.pinned ? 'Unpin session' : 'Pin session'}
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
        className="whitespace-nowrap"
        onSelect={() => onAction(() => actions.archiveSession(session.id), 'Session archived')}
      >
        <ArchiveIcon aria-hidden="true" /> Archive session
      </DropdownMenuItem>
      <DropdownMenuItem
        className="whitespace-nowrap"
        onSelect={() => onDelete({ kind: 'session', id: session.id, label: session.title })}
        variant="destructive"
      >
        <DeleteIcon aria-hidden="true" /> Delete session
      </DropdownMenuItem>
    </>
  );
}
