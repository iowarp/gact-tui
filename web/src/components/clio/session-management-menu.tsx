import type { Session } from '@clio/core/v3';
import { KeyMenuItem } from './menu-key-items';
import type { ResourceActions, ResourceTarget } from './resource-dialogs';

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
        label={session.pinned ? 'Unpin' : 'Pin'}
        menuKey="P"
        onSelect={() =>
          onAction(
            () => actions.setSessionPinned(session.id, !session.pinned),
            session.pinned ? 'Conversation unpinned' : 'Conversation pinned',
          )
        }
      />
      <KeyMenuItem
        label="Rename"
        menuKey="R"
        onSelect={() => onRename({ kind: 'session', id: session.id, label: session.title })}
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
        label="Archive"
        menuKey="A"
        onSelect={() => onAction(() => actions.archiveSession(session.id), 'Conversation archived')}
      />
      <KeyMenuItem
        label="Delete…"
        menuKey="D"
        onSelect={() => onDelete({ kind: 'session', id: session.id, label: session.title })}
        destructive
      />
    </>
  );
}
