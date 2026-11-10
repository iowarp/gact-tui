import { inTauri } from '@/lib/transport/tauri-runtime';
import type {
  ConnectedSourceState,
  CreateSourceInput,
  SftpCredentials,
  SourceMode,
  SourceProvider,
} from '@clio/core/v3';
import { useState } from 'react';

type Configuration = NonNullable<CreateSourceInput['configuration']>;

/** Providers whose location is a folder you browse to. */
export const browsedProviders = new Set(['local', 'sftp', 'obsidian']);

/** The editable fields of one source, shared by the connect form and the source detail. */
export function useSourceFields(provider: SourceProvider, source?: ConnectedSourceState) {
  const [label, setLabel] = useState(source?.label ?? '');
  const [root, setRoot] = useState(source?.root ?? '');
  const [configuration, setConfiguration] = useState<Configuration>(source?.configuration ?? {});
  const [sftpCredentials, setSftpCredentials] = useState<SftpCredentials>();
  const [sshFolder, setSshFolder] = useState<{ label: string; startPath?: string }>();
  const [githubValid, setGithubValid] = useState(provider.id !== 'github');
  const locationLocked = Boolean(source && !source.can_edit_location);
  const fallbackLabel = () =>
    browsedProviders.has(provider.id) && (provider.id !== 'sftp' || inTauri())
      ? root
          .trim()
          .replace(/[/\\]+$/, '')
          .split(/[/\\]/)
          .pop() || provider.name
      : provider.name;
  const input = (mode: SourceMode): CreateSourceInput => ({
    provider: provider.id,
    label: label.trim() || fallbackLabel(),
    root: root.trim(),
    mode,
    configuration,
    ...(sftpCredentials ? { sftp_credentials: sftpCredentials } : {}),
  });
  const ready = Boolean(root.trim()) && (provider.id !== 'github' || githubValid);
  const dirty = Boolean(
    source &&
      (label.trim() !== source.label ||
        root.trim() !== source.root ||
        sftpCredentials ||
        JSON.stringify({ ...source.configuration, ...configuration }) !==
          JSON.stringify(source.configuration)),
  );
  return {
    provider,
    source,
    label,
    setLabel,
    root,
    setRoot,
    configuration,
    setConfiguration,
    sftpCredentials,
    setSftpCredentials,
    sshFolder,
    setSshFolder,
    setGithubValid,
    locationLocked,
    input,
    ready,
    dirty,
  };
}

export type SourceFieldsState = ReturnType<typeof useSourceFields>;
