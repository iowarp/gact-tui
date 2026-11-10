import type { Workspace } from '@clio/core/v3';
import { CopyIcon, FolderOpenIcon, PinIcon, PinOffIcon, UploadIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import {
  EditIcon,
  MoreIcon,
  NewConversationIcon,
  RemoveIcon,
  SettingsIcon,
} from '@/lib/icon-vocabulary';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { copyText } from '@/lib/clipboard';
import { workspaceLabelText, type WorkspaceDisplayLabel } from '@/lib/workspace-labels';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { KeyMenuItem } from './menu-key-items';
import type { ResourceActions, ResourceTarget } from './resource-dialogs';

/** Conversations started outside a project folder live in the default workspace. */
export const DEFAULT_WORKSPACE_ID = 'ws_default';

interface WorkspaceActionsMenuProps {
  workspace: Workspace;
  label: WorkspaceDisplayLabel;
  activeWorkspaceId: string;
  actions: ResourceActions;
  onCreateSession: (workspaceId: string) => void;
  onImportSession?: (workspaceId: string) => void;
  onRename: (target: ResourceTarget) => void;
  onDelete: (target: ResourceTarget) => void;
  onEditWorkspace: (workspaceId: string) => void;
  onOpenWorkspaceFiles?: () => void;
  onAction: (action: () => Promise<void>, success: string) => void;
  /** The trigger's icon and name; a workspace row uses ⋯, the Conversations header sliders. */
  triggerIcon?: ReactElement;
  triggerLabel?: string;
}

export function WorkspaceActionsMenu({
  workspace,
  label,
  activeWorkspaceId,
  actions,
  onCreateSession,
  onImportSession,
  onRename,
  onDelete,
  onEditWorkspace,
  onOpenWorkspaceFiles,
  onAction,
  triggerIcon = <MoreIcon />,
  triggerLabel,
}: WorkspaceActionsMenuProps) {
  const labelText = workspaceLabelText(label);
  // The default workspace is the fixed Conversations section: never listed under
  // Pinned, never renamed and never removed, so those items are not offered.
  const fixed = workspace.id === DEFAULT_WORKSPACE_ID;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon={triggerIcon}
          label={triggerLabel ?? `Workspace actions for ${labelText}`}
          size="sm"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[290px]">
        <KeyMenuItem
          icon={NewConversationIcon}
          label="New conversation here"
          menuKey="N"
          onSelect={() => onCreateSession(workspace.id)}
        />
        <KeyMenuItem
          disabled={!onImportSession}
          icon={UploadIcon}
          label="Import conversation here…"
          menuKey="I"
          onSelect={() => onImportSession?.(workspace.id)}
        />
        <DropdownMenuSeparator />
        {fixed ? null : (
          <>
            <KeyMenuItem
              icon={workspace.pinned ? PinOffIcon : PinIcon}
              label={workspace.pinned ? 'Unpin' : 'Pin'}
              menuKey="P"
              onSelect={() =>
                onAction(
                  () => actions.setWorkspacePinned(workspace.id, !workspace.pinned),
                  workspace.pinned ? 'Workspace unpinned' : 'Workspace pinned',
                )
              }
            />
            <KeyMenuItem
              icon={EditIcon}
              label="Rename"
              menuKey="R"
              onSelect={() => onRename({ kind: 'workspace', id: workspace.id, label: labelText })}
            />
          </>
        )}
        <KeyMenuItem
          icon={SettingsIcon}
          label="Workspace settings…"
          menuKey="S"
          onSelect={() => onEditWorkspace(workspace.id)}
        />
        <DropdownMenuSeparator />
        <KeyMenuItem
          disabled={!onOpenWorkspaceFiles || workspace.id !== activeWorkspaceId}
          icon={FolderOpenIcon}
          label="Open folder"
          menuKey="O"
          onSelect={() => onOpenWorkspaceFiles?.()}
        />
        <KeyMenuItem
          icon={CopyIcon}
          label="Copy folder path"
          onSelect={() => void copyText(workspace.path)}
        />
        {fixed ? null : (
          <>
            <DropdownMenuSeparator />
            <KeyMenuItem
              destructive
              icon={RemoveIcon}
              label="Remove workspace…"
              onSelect={() => onDelete({ kind: 'workspace', id: workspace.id, label: labelText })}
            />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
