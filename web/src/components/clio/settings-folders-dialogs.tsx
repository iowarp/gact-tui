import type { WorkspaceSourceFolder } from '@clio/core/v3';
import { FolderIcon, FolderOpenIcon, ShieldIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { DialogFrame } from './primitives/dialog-frame';
import { IconButton } from './primitives/icon-button';
import { folderName, folderPathProblem, samePath } from './settings-folders-model';

/** A dialog row: the label left, its value or field right, always one line. */
function DialogRow({
  title,
  htmlFor,
  error,
  children,
}: {
  title: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
}) {
  const Label = htmlFor ? 'label' : 'span';
  return (
    <div className="border-b border-border/70" data-slot="dialog-row">
      <div className="flex min-h-11 min-w-0 items-center gap-4 whitespace-nowrap">
        <Label className="shrink-0 text-[0.8125rem] text-foreground" htmlFor={htmlFor}>
          {title}
        </Label>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">{children}</div>
      </div>
      {error ? (
        <p
          className="-mt-1.5 truncate pb-2 text-right text-xs text-destructive"
          id={`${htmlFor}-error`}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A plain value row of a dialog. */
function ValueRow({ title, children }: { title: string; children: string }) {
  return (
    <DialogRow title={title}>
      <span className="min-w-0 truncate text-[0.78125rem] text-foreground" title={children}>
        {children}
      </span>
    </DialogRow>
  );
}

/** A typed folder path; desktop adds its native folder picker. */
function FolderPathField({
  id,
  value,
  onChange,
  invalid,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (path: string) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const browse = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') onChange(selected);
  };
  return (
    <>
      <Input
        aria-describedby={invalid ? `${id}-error` : undefined}
        aria-invalid={invalid || undefined}
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
    </>
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
 * "Allow writing to <folder>?": the folder, what allowing it means, for whom and
 * for how long, as plain value rows. Confirming grants it at once. Give it a new
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
        <DialogRow error={problem} htmlFor="folders-allow-path" title="Folder">
          <FolderPathField
            disabled={request.pending}
            id="folders-allow-path"
            invalid={Boolean(problem)}
            onChange={setPath}
            value={path}
          />
        </DialogRow>
        <ValueRow title="What you allow">Create, change and delete files in it and below</ValueRow>
        <ValueRow title="Who">Commands and scripts in every conversation here</ValueRow>
        <ValueRow title="How long">Until you remove it in Settings, Folders</ValueRow>
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
        <DialogRow htmlFor="folders-primary-path" title="Folder">
          <FolderPathField
            disabled={request.pending}
            id="folders-primary-path"
            onChange={setPath}
            value={path}
          />
        </DialogRow>
        <ValueRow title="Conversations">Start in this folder from now on</ValueRow>
        <ValueRow title="Files">Nothing is moved or copied</ValueRow>
        <ValueRow title="Before you change it">Let running conversations finish</ValueRow>
        <DialogError>{request.error}</DialogError>
      </div>
    </DialogFrame>
  );
}
