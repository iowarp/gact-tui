import type { Workspace } from '@clio/core/v3';
import { FolderIcon } from 'lucide-react';
import { AddIcon, RemoveIcon } from '@/lib/icon-vocabulary';
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
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { vocab } from '@/lib/brand-vocabulary';
import { InfoTip } from './info-tip';
import { ClioPathPicker } from './path-picker';

export interface WorkspaceEditorActions {
  updateWorkspace: (
    workspaceId: string,
    input: { name: string; root_path: string },
  ) => Promise<void>;
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
  const [primaryPath, setPrimaryPath] = useState(workspace.path);
  const [added, setAdded] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [newFolder, setNewFolder] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const originalAdditional = initialFolders
    .filter((folder) => !folder.primary)
    .map((folder) => folder.path);
  // Merge live approvals/revocations with explicit draft changes. A newly
  // approved folder must never become an implicit removal on an unrelated Save.
  const additional = [...new Set([...originalAdditional, ...added])].filter(
    (path) => !removed.includes(path),
  );

  const addFolder = () => {
    const path = newFolder.trim();
    if (!path || path === primaryPath.trim() || additional.includes(path)) return;
    setAdded((current) => [...current, path]);
    setRemoved((current) => current.filter((candidate) => candidate !== path));
    setNewFolder('');
  };

  const save = async () => {
    setPending(true);
    setError(undefined);
    try {
      if (name.trim() !== workspace.display_name || primaryPath.trim() !== workspace.path) {
        await actions.updateWorkspace(workspace.id, {
          name: name.trim(),
          root_path: primaryPath.trim(),
        });
      }
      // Save includes a picked/typed folder even when Add was not clicked.
      const folders = [...new Set([...additional, newFolder.trim()])].filter(
        (path) => path && path !== primaryPath.trim(),
      );
      for (const path of folders.filter((path) => !originalAdditional.includes(path))) {
        await actions.grantWorkspaceFolder(workspace.id, path);
      }
      for (const path of originalAdditional.filter((path) => !folders.includes(path))) {
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
    <Dialog onOpenChange={(open) => !open && !pending && onClose()} open>
      <DialogContent className="max-h-[calc(100dvh-2rem)] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit workspace</DialogTitle>
          <DialogDescription className="sr-only">
            Edit this workspace's name and folder access.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-5 overflow-y-auto pr-1">
          <Field className="min-w-0">
            <FieldLabel htmlFor="workspace-editor-name">Workspace name</FieldLabel>
            <Input
              autoFocus
              disabled={pending}
              id="workspace-editor-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </Field>
          <Field className="min-w-0">
            <div className="flex items-center gap-2">
              <FieldLabel>Primary folder</FieldLabel>
              <InfoTip label="About the primary folder">
                Choose its new location if you moved the folder. Conversations stay in this
                workspace; files are not moved. Finish running conversations before changing it.
              </InfoTip>
            </div>
            <ClioPathPicker
              disabled={pending}
              inputLabel="Primary folder path"
              knownFolders={initialFolders}
              onChange={setPrimaryPath}
              value={primaryPath}
            />
          </Field>
          <Field className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FieldLabel>Additional folders</FieldLabel>
                <InfoTip label="About folder access">
                  {vocab.product} can read and write in these folders. Save also includes a path
                  entered below. Removing a folder revokes its additional access without deleting
                  files. Running tools pick up access changes after they finish.
                </InfoTip>
              </div>
              <span className="text-xs text-muted-foreground">Read &amp; write access</span>
            </div>
            {additional.length ? (
              <ul aria-label="Additional permitted folders" className="grid min-w-0 gap-1">
                {additional.map((path) => (
                  <FolderRow
                    key={path}
                    name={folderName(path)}
                    onRemove={
                      pending
                        ? undefined
                        : () => {
                            setAdded((current) =>
                              current.filter((candidate) => candidate !== path),
                            );
                            setRemoved((current) => [...new Set([...current, path])]);
                          }
                    }
                    path={path}
                  />
                ))}
              </ul>
            ) : null}
            <ClioPathPicker
              disabled={pending}
              inputLabel="Additional folder path"
              knownFolders={initialFolders.map((folder) => ({
                name: folder.name,
                path: folder.path,
                detail: folder.primary ? 'Primary workspace folder' : 'Permitted folder',
              }))}
              onChange={setNewFolder}
              placeholder="Type, paste, or browse for a folder"
              value={newFolder}
            />
            <div className="flex">
              <Button
                disabled={pending || !newFolder.trim()}
                onClick={addFolder}
                size="sm"
                type="button"
                variant="ghost"
              >
                <AddIcon aria-hidden="true" /> Add folder
              </Button>
            </div>
          </Field>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button disabled={pending} onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={pending || !name.trim() || !primaryPath.trim()}
            onClick={() => void save()}
            type="button"
          >
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
}: {
  name: string;
  onRemove?: () => void;
  path: string;
}) {
  return (
    <li className="flex min-w-0 items-center gap-3 py-2">
      <FolderIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground" title={path}>
          {path}
        </p>
      </div>
      <Button
        aria-label={`Remove folder ${name}`}
        disabled={!onRemove}
        onClick={onRemove}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <RemoveIcon aria-hidden="true" />
      </Button>
    </li>
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
