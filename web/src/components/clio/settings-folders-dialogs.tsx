import type { WorkspaceSourceFolder } from '@clio/core/v3';
import { FolderIcon, FolderOpenIcon, ShieldIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { DialogFrame } from './primitives/dialog-frame';
import { IconButton } from './primitives/icon-button';
import { SettingsRow } from './settings-row';
import { folderName, folderPathProblem, samePath } from './settings-folders-model';
import { ph, t } from '@lingui/core/macro';

/** A plain value row (the spec's `.zv`): right-aligned, wrapping only when it doesn't fit. */
function ValueRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SettingsRow fullWidth title={title}>
      <span className="min-w-0 text-menu text-pretty whitespace-normal text-foreground">
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
          aria-label={t`Folder`}
          autoComplete="off"
          className="min-w-0 flex-1 font-mono md:text-menu"
          data-initial-focus=""
          disabled={disabled}
          id={id}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t`Type or paste a folder path`}
          spellCheck={false}
          title={value || undefined}
          value={value}
        />
        {inTauri() ? (
          <IconButton
            disabled={disabled}
            icon={<FolderOpenIcon />}
            label={t`Browse for a folder`}
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
        label: request.pending ? t`Allowing…` : t`Allow folder`,
        onConfirm: () => void allow(),
        disabled: request.pending || !path.trim() || Boolean(problem),
      }}
      icon={<ShieldIcon className="size-4" />}
      onOpenChange={(next) => !request.pending && onOpenChange(next)}
      open={open}
      title={
        path.trim()
          ? t`Allow writing to ${ph({ folder: folderName(path.trim()) })}?`
          : t`Allow writing to a folder?`
      }
    >
      <div data-slot="allow-folder">
        <SettingsRow fullWidth htmlFor="folders-allow-path" title={t`Folder`}>
          <FolderPathField
            disabled={request.pending}
            error={problem}
            id="folders-allow-path"
            onChange={setPath}
            value={path}
          />
        </SettingsRow>
        <ValueRow
          title={t`What you allow`}
        >{t`Create, change and delete files in it and below`}</ValueRow>
        <ValueRow title={t`Who`}>{t`Commands and scripts in every conversation here`}</ValueRow>
        <ValueRow title={t`How long`}>{t`Until you remove it in Settings, Folders`}</ValueRow>
        <ValueRow title={t`Then`}>{t`The blocked command isn’t rerun. Ask again.`}</ValueRow>
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
        label: request.pending ? t`Changing…` : t`Change folder`,
        onConfirm: () => void change(),
        disabled: request.pending || unchanged,
      }}
      icon={<FolderIcon className="size-4" />}
      onOpenChange={(next) => !request.pending && onOpenChange(next)}
      open={open}
      title={t`Change the primary folder?`}
    >
      <div data-slot="change-primary-folder">
        <SettingsRow fullWidth htmlFor="folders-primary-path" title={t`Folder`}>
          <FolderPathField
            disabled={request.pending}
            id="folders-primary-path"
            onChange={setPath}
            value={path}
          />
        </SettingsRow>
        <ValueRow title={t`Conversations`}>{t`Start in this folder from now on`}</ValueRow>
        <ValueRow title={t`Files`}>{t`Nothing is moved or copied`}</ValueRow>
        <ValueRow title={t`Before you change it`}>{t`Let running conversations finish`}</ValueRow>
        <DialogError>{request.error}</DialogError>
      </div>
    </DialogFrame>
  );
}
