import type { Workspace } from '@clio/core/v3';
import { FolderIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ClioPathPicker } from './path-picker';

export interface WorkspaceEditorActions {
  renameWorkspace: (workspaceId: string, name: string) => Promise<void>;
  grantWorkspaceFolder: (workspaceId: string, path: string) => Promise<void>;
  revokeWorkspaceFolder: (workspaceId: string, path: string) => Promise<void>;
}

export function WorkspaceEditorDialog({
  actions,
  onClose,
  workspace,
}: {
  actions: WorkspaceEditorActions;
  onClose: () => void;
  workspace: Workspace;
}) {
  const initialFolders = useMemo(
    () =>
      workspace.source_folders?.length
        ? workspace.source_folders
        : [{ name: folderName(workspace.path), path: workspace.path, primary: true }],
    [workspace],
  );
  const [name, setName] = useState(workspace.display_name);
  const [additional, setAdditional] = useState(
    initialFolders.filter((folder) => !folder.primary).map((folder) => folder.path),
  );
  const [newFolder, setNewFolder] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const primary = initialFolders.find((folder) => folder.primary) ?? initialFolders[0];
  const originalAdditional = initialFolders
    .filter((folder) => !folder.primary)
    .map((folder) => folder.path);

  const addFolder = () => {
    const path = newFolder.trim();
    if (!path || path === primary?.path || additional.includes(path)) return;
    setAdditional((current) => [...current, path]);
    setNewFolder('');
  };

  const save = async () => {
    setPending(true);
    setError(undefined);
    try {
      if (name.trim() !== workspace.display_name) {
        await actions.renameWorkspace(workspace.id, name.trim());
      }
      for (const path of additional.filter((path) => !originalAdditional.includes(path))) {
        await actions.grantWorkspaceFolder(workspace.id, path);
      }
      for (const path of originalAdditional.filter((path) => !additional.includes(path))) {
        await actions.revokeWorkspaceFolder(workspace.id, path);
      }
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit workspace</DialogTitle>
          <DialogDescription>
            Change its name and the folders this workspace is allowed to use.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          <Field>
            <FieldLabel htmlFor="workspace-editor-name">Workspace name</FieldLabel>
            <Input
              autoFocus
              id="workspace-editor-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </Field>
          <Field>
            <div className="flex items-center justify-between gap-3">
              <FieldLabel>Folders</FieldLabel>
              <span className="text-xs text-muted-foreground">
                {1 + additional.length} permitted
              </span>
            </div>
            <div className="overflow-hidden rounded-xl border bg-muted/15">
              {primary ? <FolderRow name={primary.name} path={primary.path} primary /> : null}
              {additional.map((path) => (
                <FolderRow
                  key={path}
                  name={folderName(path)}
                  onRemove={() =>
                    setAdditional((current) => current.filter((candidate) => candidate !== path))
                  }
                  path={path}
                />
              ))}
              <div className="grid gap-2 border-t p-2">
                <ClioPathPicker
                  knownFolders={initialFolders.map((folder) => ({
                    name: folder.name,
                    path: folder.path,
                    detail: folder.primary ? 'Primary workspace folder' : 'Permitted folder',
                  }))}
                  onChange={setNewFolder}
                  placeholder="Choose another permitted folder"
                  value={newFolder}
                />
                <Button
                  className="w-fit"
                  disabled={!newFolder.trim()}
                  onClick={addFolder}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <PlusIcon aria-hidden="true" /> Add permitted folder
                </Button>
              </div>
            </div>
            <FieldDescription>
              The primary folder anchors the workspace. Additional folders are explicit access
              grants and can be removed here.
            </FieldDescription>
          </Field>
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button disabled={pending} onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={pending || !name.trim()} onClick={() => void save()} type="button">
            {pending ? 'Saving…' : 'Save workspace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FolderRow({
  name,
  onRemove,
  path,
  primary = false,
}: {
  name: string;
  onRemove?: () => void;
  path: string;
  primary?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
      <FolderIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate font-mono text-[10px] text-muted-foreground" title={path}>
          {path}
        </p>
      </div>
      {primary ? (
        <span className="rounded-md border px-2 py-0.5 text-[10px] text-muted-foreground">
          Primary
        </span>
      ) : (
        <Button
          aria-label={`Remove folder ${name}`}
          onClick={onRemove}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

function folderName(path: string): string {
  return (
    path
      .split(/[\\/]+/u)
      .filter(Boolean)
      .at(-1) ||
    path ||
    'Workspace folder'
  );
}
