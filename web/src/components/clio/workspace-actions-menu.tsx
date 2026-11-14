import type { Workspace } from '@clio/core/v3';
import {
  CopyIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  PanelRightIcon,
  PinIcon,
  PinOffIcon,
  UploadIcon,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
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
import {
  DEFAULT_WORKSPACE_ID,
  workspaceLabelText,
  type WorkspaceDisplayLabel,
} from '@/lib/workspace-labels';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { openInFileManagerLabel } from '@/tauri/workspace-terminal';
import { KeyMenuItem } from './menu-key-items';
import { useHoldRailWhile } from './rail-menu-hold';
import type { ResourceActions, ResourceTarget } from './resource-dialogs';
import { ResponsiveMenuSub } from './responsive-menu-sub';
import { selectMenuKey } from './select-menu-key';
import { t } from '@lingui/core/macro';

export { DEFAULT_WORKSPACE_ID };

interface WorkspaceActionsMenuProps {
  workspace: Workspace;
  label: WorkspaceDisplayLabel;
  actions: ResourceActions;
  onCreateSession: (workspaceId: string) => void;
  onImportSession?: (workspaceId: string) => void;
  onRename: (target: ResourceTarget) => void;
  onDelete: (target: ResourceTarget) => void;
  onEditWorkspace: (workspaceId: string) => void;
  onOpenWorkspaceFiles?: (workspaceId: string) => void;
  onAction: (action: () => Promise<void>, success: string) => void;
  /** The trigger's icon and name; a workspace row uses ⋯, the Conversations header sliders. */
  triggerIcon?: ReactElement;
  triggerLabel?: string;
  /** Controlled by a row that also opens the menu on right-click. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function WorkspaceActionsMenu({
  workspace,
  label,
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
  open: controlledOpen,
  onOpenChange,
}: WorkspaceActionsMenuProps) {
  const labelText = workspaceLabelText(label);
  // The default workspace is the fixed Conversations section: never listed under
  // Pinned, never renamed and never removed, so those items are not offered.
  const fixed = workspace.id === DEFAULT_WORKSPACE_ID;
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  useHoldRailWhile(open);
  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon={triggerIcon}
          label={triggerLabel ?? t`Workspace actions for ${labelText}`}
          size="sm"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[290px]" onKeyDown={selectMenuKey}>
        <KeyMenuItem
          icon={NewConversationIcon}
          label={t`New conversation here`}
          menuKey="N"
          onSelect={() => onCreateSession(workspace.id)}
        />
        <KeyMenuItem
          disabled={!onImportSession}
          icon={UploadIcon}
          label={t`Import conversation here…`}
          menuKey="I"
          onSelect={() => onImportSession?.(workspace.id)}
        />
        <DropdownMenuSeparator />
        {fixed ? null : (
          <>
            <KeyMenuItem
              icon={workspace.pinned ? PinOffIcon : PinIcon}
              label={workspace.pinned ? t`Unpin` : t`Pin`}
              menuKey="P"
              onSelect={() =>
                onAction(
                  () => actions.setWorkspacePinned(workspace.id, !workspace.pinned),
                  workspace.pinned ? t`Workspace unpinned` : t`Workspace pinned`,
                )
              }
            />
            <KeyMenuItem
              icon={EditIcon}
              label={t`Rename`}
              menuKey="R"
              onSelect={() => onRename({ kind: 'workspace', id: workspace.id, label: labelText })}
            />
          </>
        )}
        <KeyMenuItem
          icon={SettingsIcon}
          label={t`Workspace settings…`}
          menuKey="S"
          onSelect={() => onEditWorkspace(workspace.id)}
        />
        <DropdownMenuSeparator />
        <ResponsiveMenuSub icon={FolderOpenIcon} label={t`Open folder`} menuKey="O" width={220}>
          <KeyMenuItem
            disabled={!onOpenWorkspaceFiles}
            icon={PanelRightIcon}
            label={t`In a tab`}
            menuKey="T"
            onSelect={() => onOpenWorkspaceFiles?.(workspace.id)}
          />
          {actions.openSystemFolder ? (
            <KeyMenuItem
              icon={ExternalLinkIcon}
              label={openInFileManagerLabel()}
              menuKey="E"
              onSelect={() => void actions.openSystemFolder?.(workspace.path)}
            />
          ) : null}
        </ResponsiveMenuSub>
        <KeyMenuItem
          icon={CopyIcon}
          label={t`Copy folder path`}
          onSelect={() => void copyText(workspace.path)}
        />
        {fixed ? null : (
          <>
            <DropdownMenuSeparator />
            <KeyMenuItem
              destructive
              icon={RemoveIcon}
              label={t`Remove workspace…`}
              onSelect={() => onDelete({ kind: 'workspace', id: workspace.id, label: labelText })}
            />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
