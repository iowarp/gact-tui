import type { WorkspaceSourceFolder } from '@clio/core/v3';
import { FolderIcon, FolderOpenIcon, ShieldIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { DialogFrame } from './primitives/dialog-frame';
import { IconButton } from './primitives/icon-button';
import { SettingsRow } from './settings-row';
import { folderName, folderPathProblem, samePath } from './settings-folders-model';

/**
 * The spec's dialog frame is 44% of the window up to 600 px. These dialogs keep at least
 * 440 px, so each value stays on one line beside its label until the frame becomes a sheet.
 */
const FOLDER_DIALOG_WIDTH = 'w-[clamp(440px,44vw,600px)]';

/** A plain value row (the spec's `.zv`): right-aligned, wrapping only when it doesn't fit. */
function ValueRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SettingsRow fullWidth title={title}>
      <span className="min-w-0 text-right text-[0.78125rem] whitespace-normal text-foreground">
        {children}
      </span>
    </SettingsRow>
  );
}

/**
 * A typed folder path; desktop adds its native folder picker. The error sits under the field.
 * Adding from Settings has no blocked path to show, and a remote agent's folders can't be
 * browsed from here, so the path is typed.
 */
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
          className="min-w-0 flex-1 font-mono md:text-[0.78125rem]"
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
        <span className="text-xs whitespace-normal text-destructive" id={`${id}-error`}>
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
 * long and what happens next, as plain value rows. Confirming grants it at once. Give it a new
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
      className={FOLDER_DIALOG_WIDTH}
      icon={<ShieldIcon className="size-4" />}
      onOpenChange={(next) => !request.pending && onOpenChange(next)}
      open={open}
      title={
        path.trim() ? `Allow writing to ${folderName(path.trim())}?` : 'Allow writing to a folder?'
      }
    >
      <div data-slot="allow-folder">
        <SettingsRow fullWidth htmlFor="folders-allow-path" title="Folder">
          <FolderPathField
            disabled={request.pending}
            error={problem}
            id="folders-allow-path"
            onChange={setPath}
            value={path}
          />
        </SettingsRow>
        <ValueRow title="What you allow">Create, change and delete files in it and below</ValueRow>
        <ValueRow title="Who">Commands and scripts in every conversation here</ValueRow>
        <ValueRow title="How long">Until you remove it in Settings, Folders</ValueRow>
        <ValueRow title="Then">The blocked command isn’t rerun. Ask again.</ValueRow>
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
      className={FOLDER_DIALOG_WIDTH}
      icon={<FolderIcon className="size-4" />}
      onOpenChange={(next) => !request.pending && onOpenChange(next)}
      open={open}
      title="Change the primary folder?"
    >
      <div data-slot="change-primary-folder">
        <SettingsRow fullWidth htmlFor="folders-primary-path" title="Folder">
          <FolderPathField
            disabled={request.pending}
            id="folders-primary-path"
            onChange={setPath}
            value={path}
          />
        </SettingsRow>
        <ValueRow title="Conversations">Start in this folder from now on</ValueRow>
        <ValueRow title="Files">Nothing is moved or copied</ValueRow>
        <ValueRow title="Before you change it">Let running conversations finish</ValueRow>
        <DialogError>{request.error}</DialogError>
      </div>
    </DialogFrame>
  );
}
