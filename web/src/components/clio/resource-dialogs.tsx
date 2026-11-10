import type { Workspace } from '@clio/core/v3';
import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { capitalize, vocab } from '@/lib/brand-vocabulary';
import { DeleteIcon, EditIcon } from '@/lib/icon-vocabulary';
import { ClioPathPicker } from './path-picker';
import { DialogFrame } from './primitives/dialog-frame';

const TEXT_FIELD = 'h-[30px] text-[12.5px] md:text-[12.5px]';

export type ResourceTarget = {
  kind: 'workspace' | 'session';
  id: string;
  label: string;
};

export interface ResourceActions {
  createWorkspace: (input: { name: string; rootPath: string }) => Promise<void>;
  renameWorkspace: (workspaceId: string, name: string) => Promise<void>;
  updateWorkspace: (
    workspaceId: string,
    input: { name: string; root_path: string },
  ) => Promise<void>;
  grantWorkspaceFolder: (workspaceId: string, path: string) => Promise<void>;
  revokeWorkspaceFolder: (workspaceId: string, path: string) => Promise<void>;
  workspaceMemory?: (workspaceId: string) => Promise<{ use_account_memory: boolean }>;
  setWorkspaceMemory?: (workspaceId: string, useAccountMemory: boolean) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  setWorkspacePinned: (workspaceId: string, pinned: boolean) => Promise<void>;
  setSessionPinned: (sessionId: string, pinned: boolean) => Promise<void>;
  archiveSession: (sessionId: string) => Promise<void>;
  /** Branches a conversation into a new one and opens it. */
  forkSession?: (sessionId: string) => Promise<void>;
  /** Moves a conversation or branch into another workspace (`x_clio_session_move`). */
  moveSession?: (sessionId: string, workspaceId: string) => Promise<void>;
  /** Appends a compaction checkpoint and reports whether the service compacted. */
  compactSession?: (sessionId: string) => Promise<void>;
  /** Permanently removes the conversation's last stored message. */
  undoSession?: (sessionId: string) => Promise<void>;
  /** Mints a read-only share link and resolves to its absolute URL. */
  shareSession?: (sessionId: string, ttlSeconds: number) => Promise<string>;
  /** Desktop only: opens the OS terminal app at a workspace folder. */
  openSystemTerminal?: (workspacePath: string) => Promise<void>;
  restoreSession: (sessionId: string) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  exportSession: (
    sessionId: string,
    mode: import('@clio/core/v3').SessionExportMode,
  ) => Promise<{ download_path: string; filename: string }>;
  importSession: (value: unknown) => Promise<void>;
}

interface ClioResourceDialogsProps {
  actions: ResourceActions;
  createWorkspaceOpen: boolean;
  deleteTarget: ResourceTarget | null;
  onCreateWorkspaceOpenChange: (open: boolean) => void;
  onDeleteTargetChange: (target: ResourceTarget | null) => void;
  onRenameTargetChange: (target: ResourceTarget | null) => void;
  renameTarget: ResourceTarget | null;
  workspaces: readonly Workspace[];
}

export function ClioResourceDialogs(props: ClioResourceDialogsProps) {
  return (
    <>
      {props.createWorkspaceOpen ? (
        <CreateWorkspaceDialog
          actions={props.actions}
          onClose={() => props.onCreateWorkspaceOpenChange(false)}
          workspaces={props.workspaces}
        />
      ) : null}
      {props.renameTarget ? (
        <RenameResourceDialog
          actions={props.actions}
          key={`${props.renameTarget.kind}:${props.renameTarget.id}`}
          onClose={() => props.onRenameTargetChange(null)}
          target={props.renameTarget}
        />
      ) : null}
      {props.deleteTarget ? (
        <DeleteResourceDialog
          actions={props.actions}
          key={`${props.deleteTarget.kind}:${props.deleteTarget.id}`}
          onClose={() => props.onDeleteTargetChange(null)}
          target={props.deleteTarget}
        />
      ) : null}
    </>
  );
}

/** + on Workspaces. A new conversation is a draft page (?), not a dialog. */
function CreateWorkspaceDialog({
  actions,
  onClose,
  workspaces,
}: {
  actions: ResourceActions;
  onClose: () => void;
  workspaces: readonly Workspace[];
}) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [rootPath, setRootPath] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    setPending(true);
    setError(undefined);
    try {
      const trimmedPath = rootPath.trim();
      await actions.createWorkspace({
        name:
          workspaceName.trim() || trimmedPath.split(/[\\/]+/).at(-1) || capitalize(vocab.workspace),
        rootPath: trimmedPath,
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(false);
    }
  };

  return (
    <DialogFrame
      confirm={{
        label: pending ? 'Creating?' : `Create ${vocab.workspace}`,
        disabled: pending || !rootPath.trim(),
        onConfirm: () => void submit(),
      }}
      description="Name it and choose the folder it works in."
      onOpenChange={(open) => !open && onClose()}
      open
      title={`New ${vocab.workspace}`}
    >
      <WorkspaceFields
        name={workspaceName}
        onNameChange={setWorkspaceName}
        onPathChange={setRootPath}
        path={rootPath}
        workspaces={workspaces}
      />
      {error ? (
        <p className="mt-2 text-[12.5px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </DialogFrame>
  );
}

function WorkspaceFields({
  name,
  onNameChange,
  onPathChange,
  path,
  workspaces,
}: {
  name: string;
  onNameChange: (value: string) => void;
  onPathChange: (value: string) => void;
  path: string;
  workspaces: readonly Workspace[];
}) {
  return (
    <div className="grid gap-3">
      <StackedField htmlFor="new-workspace-name" label={`${capitalize(vocab.workspace)} name`}>
        <Input
          autoFocus
          className={TEXT_FIELD}
          id="new-workspace-name"
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="EarthScope analysis"
          value={name}
        />
      </StackedField>
      <StackedField
        description={`Becomes the ${vocab.workspace} boundary. Files aren’t moved.`}
        htmlFor="new-workspace-folder"
        label={`${capitalize(vocab.workspace)} folder`}
      >
        <ClioPathPicker
          className="h-[30px]"
          inputId="new-workspace-folder"
          knownFolders={workspaces.flatMap((workspace) =>
            (workspace.source_folders?.length
              ? workspace.source_folders
              : [
                  {
                    name: workspace.display_name,
                    path: workspace.path,
                    primary: true,
                  },
                ]
            ).map((folder) => ({
              name: folder.name,
              path: folder.path,
              detail: `${workspace.display_name}: ${folder.path}`,
            })),
          )}
          onChange={onPathChange}
          placeholder="Choose a folder"
          value={path}
        />
      </StackedField>
    </div>
  );
}

/** Spec `.xf`: a 12px label above a full-width 30px field, with an optional note below. */
function StackedField({
  children,
  description,
  htmlFor,
  label,
}: {
  children: ReactNode;
  description?: string;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label
        className="text-xs font-normal whitespace-nowrap text-muted-foreground"
        htmlFor={htmlFor}
      >
        {label}
      </Label>
      {children}
      {description ? (
        <p
          className="truncate text-[11.5px] leading-snug text-muted-foreground"
          title={description}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function RenameResourceDialog({
  actions,
  onClose,
  target,
}: {
  actions: ResourceActions;
  onClose: () => void;
  target: ResourceTarget;
}) {
  const [value, setValue] = useState(target.label);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const save = async () => {
    setPending(true);
    setError(undefined);
    try {
      if (target.kind === 'workspace') await actions.renameWorkspace(target.id, value.trim());
      else await actions.renameSession(target.id, value.trim());
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(false);
    }
  };
  const name = value.trim();
  const confirm = () => {
    if (name && !pending) void save();
  };
  return (
    <DialogFrame
      confirm={{
        label: pending ? 'Saving…' : 'Save name',
        disabled: pending || !name,
        onConfirm: confirm,
      }}
      description="Its files and history stay as they are."
      icon={<EditIcon />}
      onOpenChange={(open) => !open && onClose()}
      open
      title={target.kind === 'session' ? 'Rename conversation' : `Rename ${vocab.workspace}`}
    >
      {/* Label over a full-width field (spec .xf), so the current name reads in full. */}
      <div className="grid gap-1.5">
        <Label htmlFor="rename-resource" className="text-xs font-normal text-muted-foreground">
          Name
        </Label>
        <Input
          className="h-[30px] text-[12.5px] md:text-[12.5px]"
          data-initial-focus=""
          id="rename-resource"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) return;
            event.preventDefault();
            confirm();
          }}
          value={value}
        />
      </div>
      {error ? (
        <p className="mt-2 text-[12.5px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </DialogFrame>
  );
}

export function DeleteResourceDialog({
  actions,
  onClose,
  target,
}: {
  actions: ResourceActions;
  onClose: () => void;
  target: ResourceTarget;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const remove = async () => {
    setPending(true);
    setError(undefined);
    try {
      if (target.kind === 'workspace') await actions.deleteWorkspace(target.id);
      else await actions.deleteSession(target.id);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(false);
    }
  };
  const session = target.kind === 'session';
  return (
    <DialogFrame
      alert
      cancelLabel={session ? 'Keep conversation' : `Keep ${vocab.workspace}`}
      confirm={{
        label: session
          ? pending
            ? 'Deleting…'
            : 'Delete permanently'
          : pending
            ? 'Removing…'
            : `Remove ${vocab.workspace}`,
        tone: 'destructive',
        disabled: pending,
        onConfirm: () => void remove(),
      }}
      description={
        session
          ? 'Removes it and its record from the service. This can’t be undone.'
          : `Unregisters the ${vocab.workspace} and removes its conversations from the service. Files on disk are not deleted.`
      }
      icon={<DeleteIcon />}
      onOpenChange={(open) => !open && onClose()}
      open
      title={`${session ? 'Delete' : 'Remove'} ${target.label}?`}
    >
      {error ? (
        <p className="text-[12.5px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </DialogFrame>
  );
}
