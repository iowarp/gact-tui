import { inTauri } from '@/lib/transport/tauri-runtime';
import type {
  ConnectedSourceState,
  CreateSourceInput,
  S3Credentials,
  SftpCredentials,
  SourceMode,
  SourceProvider,
} from '@clio/core/v3';
import { useState } from 'react';
import { normalizeDriveFolder } from '@/lib/drive-folder-link';

type Configuration = NonNullable<CreateSourceInput['configuration']>;

/** Providers whose location is a folder you browse to. */
export const browsedProviders = new Set(['local', 'sftp', 'obsidian']);

/** The editable fields of one source, shared by the connect form and the source detail. */
export function useSourceFields(provider: SourceProvider, source?: ConnectedSourceState) {
  const [label, setLabel] = useState(source?.label ?? '');
  const [root, setRoot] = useState(source?.root ?? '');
  const [configuration, setConfiguration] = useState<Configuration>(source?.configuration ?? {});
  const [sftpCredentials, setSftpCredentials] = useState<SftpCredentials>();
  const [s3Credentials, setS3Credentials] = useState<S3Credentials>();
  const [sshFolder, setSshFolder] = useState<{ label: string; startPath?: string }>();
  const [githubValid, setGithubValid] = useState(provider.id !== 'github');
  const locationLocked = Boolean(source && !source.can_edit_location);
  const location = () =>
    provider.id === 'google_drive' ? normalizeDriveFolder(root) : root.trim();
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
    root: location(),
    mode,
    configuration,
    ...(sftpCredentials ? { sftp_credentials: sftpCredentials } : {}),
    ...(s3Credentials && configuration.s3_access === 'keys'
      ? { s3_credentials: s3Credentials }
      : {}),
  });
  const s3Ready =
    provider.id !== 's3' ||
    (Boolean(configuration.s3_region) &&
      (configuration.s3_access !== 'keys' ||
        Boolean(s3Credentials?.access_key_id && s3Credentials.secret_access_key)));
  const ready = Boolean(root.trim()) && (provider.id !== 'github' || githubValid) && s3Ready;
  const dirty = Boolean(
    source &&
      (label.trim() !== source.label ||
        location() !== source.root ||
        sftpCredentials ||
        s3Credentials ||
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
    s3Credentials,
    setS3Credentials,
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
