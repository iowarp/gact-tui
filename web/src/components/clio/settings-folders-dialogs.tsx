import type { WorkspaceSourceFolder } from '@clio/core/v3';
import { FolderIcon, FolderOpenIcon, ShieldIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { DialogFrame } from './primitives/dialog-frame';
import { IconButton } from './primitives/icon-button';
import { KeyValueGrid } from './primitives/key-value-grid';
import { folderName, folderPathProblem, samePath } from './settings-folders-model';

/** A typed folder path; desktop adds its native folder picker. The error sits under the field. */
function FolderPathField({
  id,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (path: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const browse = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') onChange(selected);
  };
  return (
    <span className="grid min-w-0 flex-1 gap-1">
      <span className="flex min-w-0 items-center gap-1.5">
        <Input
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={error ? true : undefined}
          aria-label="Folder"
          autoComplete="off"
          className="h-[1.875rem] min-w-0 flex-1 font-mono text-xs md:text-xs"
          data-initial-focus=""
          disabled={disabled}
          id={id}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Type or paste a folder path"
          spellCheck={false}
          title={value || undefined}
          value={value}
        />
        {inTauri() ? (
          <IconButton
            disabled={disabled}
            icon={<FolderOpenIcon />}
            label="Browse for a folder"
            onClick={() => void browse()}
          />
        ) : null}
      </span>
      {error ? (
        <span className="text-xs text-destructive" id={`${id}-error`}>
          {error}
        </span>
      ) : null}
    </span>
  );
}

function useDialogRequest() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (work: () => Promise<void>) => {
    setPending(true);
    setError(undefined);
    try {
      await work();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setPending(false);
    }
  };
  return { pending, error, run };
}

function DialogError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p className="truncate pt-2 text-xs text-destructive" role="alert">
      {children}
    </p>
  );
}

/**
 * "Allow writing to <folder>?": the folder, what allowing it means, for whom, for how
 * long and what happens next, as wrapping dialog facts. Confirming grants it at once. Give it a new
 * key each time it opens so the field starts empty.
 */
export function AllowFolderDialog({
  open,
  onOpenChange,
  primary,
  additional,
  onAllow,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  primary: string;
  additional: readonly WorkspaceSourceFolder[];
  onAllow: (path: string) => Promise<void>;
}) {
  const [path, setPath] = useState('');
  const request = useDialogRequest();
  const problem = folderPathProblem(path, primary, additional);
  const allow = async () => {
    if (!path.trim() || problem) return;
    if (await request.run(() => onAllow(path.trim()))) onOpenChange(false);
  };
  return (
    <DialogFrame
      confirm={{
        label: request.pending ? 'Allowing…' : 'Allow folder',
        onConfirm: () => void allow(),
        disabled: request.pending || !path.trim() || Boolean(problem),
      }}
      icon={<ShieldIcon className="size-4" />}
      onOpenChange={(next) => !request.pending && onOpenChange(next)}
      open={open}
      title={
        path.trim() ? `Allow writing to ${folderName(path.trim())}?` : 'Allow writing to a folder?'
      }
    >
      <div data-slot="allow-folder">
        <KeyValueGrid
          aria-label="What allowing this folder means"
          items={[
            {
              label: 'Folder',
              value: (
                <FolderPathField
                  disabled={request.pending}
                  error={problem}
                  id="folders-allow-path"
                  onChange={setPath}
                  value={path}
                />
              ),
            },
            { label: 'What you allow', value: 'Create, change and delete files in it and below' },
            { label: 'Who', value: 'Commands and scripts in every conversation here' },
            { label: 'How long', value: 'Until you remove it in Settings, Folders' },
            { label: 'Then', value: 'Blocked commands aren’t rerun. Ask again.' },
          ]}
          variant="facts"
          wrap
        />
        <DialogError>{request.error}</DialogError>
      </div>
    </DialogFrame>
  );
}

/** Moves the workspace to a new primary folder; files stay where they are. Key it per opening. */
export function ChangePrimaryDialog({
  open,
  onOpenChange,
  current,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: string;
  onChange: (path: string) => Promise<void>;
}) {
  const [path, setPath] = useState(current);
  const request = useDialogRequest();
  const unchanged = !path.trim() || samePath(path, current);
  const change = async () => {
    if (unchanged) return;
    if (await request.run(() => onChange(path.trim()))) onOpenChange(false);
  };
  return (
    <DialogFrame
      confirm={{
        label: request.pending ? 'Changing…' : 'Change folder',
        onConfirm: () => void change(),
        disabled: request.pending || unchanged,
      }}
      icon={<FolderIcon className="size-4" />}
      onOpenChange={(next) => !request.pending && onOpenChange(next)}
      open={open}
      title="Change the primary folder?"
    >
      <div data-slot="change-primary-folder">
        <KeyValueGrid
          aria-label="What changing the primary folder means"
          items={[
            {
              label: 'Folder',
              value: (
                <FolderPathField
                  disabled={request.pending}
                  id="folders-primary-path"
                  onChange={setPath}
                  value={path}
                />
              ),
            },
            { label: 'Conversations', value: 'Start in this folder from now on' },
            { label: 'Files', value: 'Nothing is moved or copied' },
            { label: 'First', value: 'Let running conversations finish' },
          ]}
          variant="facts"
          wrap
        />
        <DialogError>{request.error}</DialogError>
      </div>
    </DialogFrame>
  );
}
