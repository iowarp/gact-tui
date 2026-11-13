import type { Session } from '@clio/core/v3';
import { CheckIcon, FolderIcon, MessageSquareIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useSessionMoveSupported, useSessionMoveTargets } from '@/hooks/use-session-move';
import { canMoveSession } from '@/lib/session-move';
import {
  DEFAULT_WORKSPACE_ID,
  workspaceLabels,
  workspaceLabelText,
  workspaceName,
} from '@/lib/workspace-labels';
import type { ResourceActions } from './resource-dialogs';
import { ResponsiveMenuSub } from './responsive-menu-sub';
import { WorkspaceMark } from './workspace-mark';
import { t, ph } from '@lingui/core/macro';

/**
 * Move to ›: Conversations, then each workspace, the current one checked. Shared
 * by the row, right-click and title menus; shown only when the service can move
 * this kind of conversation.
 */
export function SessionMoveMenu({
  session,
  actions,
  onAction,
}: {
  session: Session;
  actions: ResourceActions;
  onAction: (action: () => Promise<void>, success: string) => void;
}) {
  const { moveSession } = actions;
  // The item mounts with its open menu; once offered, a refetch neither drops
  // it nor reorders its targets under the keyboard until the menu closes.
  const live = useSessionMoveSupported();
  const [supported, setSupported] = useState(live);
  if (live && !supported) setSupported(true);
  const movable = Boolean(moveSession) && supported && canMoveSession(session);
  const workspaces = useSessionMoveTargets(movable);
  const [listed, setListed] = useState(workspaces.data);
  if (workspaces.data && !listed) setListed(workspaces.data);
  const conversations = t`Conversations`;
  const targets = useMemo(() => {
    const rows = (listed ?? []).filter((workspace) => workspace.id !== DEFAULT_WORKSPACE_ID);
    const labels = workspaceLabels(rows);
    return [
      { id: DEFAULT_WORKSPACE_ID, label: conversations },
      ...rows.map((workspace) => {
        const label = labels.get(workspace.id);
        return {
          id: workspace.id,
          label: label ? workspaceLabelText(label) : workspaceName(workspace),
        };
      }),
    ];
  }, [conversations, listed]);
  if (!movable || !moveSession) return null;
  return (
    <ResponsiveMenuSub
      contentClassName="max-h-[min(360px,60vh)] overflow-y-auto"
      icon={FolderIcon}
      label={t`Move to`}
      width={240}
    >
      {targets.map((target) => {
        const current = target.id === session.workspace_id;
        return (
          <DropdownMenuItem
            aria-current={current ? 'true' : undefined}
            className="whitespace-nowrap"
            key={target.id}
            onSelect={() => {
              if (current) return;
              onAction(
                () => moveSession(session.id, target.id),
                t`Moved to ${ph({ label: target.label })}`,
              );
            }}
          >
            {target.id === DEFAULT_WORKSPACE_ID ? (
              <MessageSquareIcon aria-hidden="true" className="text-muted-foreground" />
            ) : (
              <WorkspaceMark id={target.id} />
            )}
            <span className="min-w-0 truncate">{target.label}</span>
            {current ? (
              <CheckIcon
                aria-label={t`Current workspace`}
                className="ml-auto text-muted-foreground"
              />
            ) : null}
          </DropdownMenuItem>
        );
      })}
    </ResponsiveMenuSub>
  );
}
