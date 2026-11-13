import type { ConnectedSourceState, SourceMode, SourceProviderId } from '@clio/core/v3';
import type { StatusTone } from './primitives/status-indicator';

/** An entry as the provider names it; `path` may be a portable alias of that name. */
export function sourceEntryName(entry: { path: string; remote_path?: string }): string {
  return entry.remote_path || entry.path;
}

/** A source's configured access, named as the Access choice names it. */
export const sourceModeNames: Record<SourceMode, string> = {
  read_only: 'Read only',
  working_copy: 'Editable download',
  write_enabled: 'Read and write link',
};

export type LinkAccess = 'read_only' | 'publish_later' | 'write_through';
export type DownloadAccess = 'read_only' | 'editable';

export const linkAccessNames: Record<LinkAccess, string> = {
  read_only: 'Read only',
  publish_later: 'Edit locally, publish later',
  write_through: 'Update originals on save',
};

/** The access choice's own name (spec Access: Read only, Editable download, Read and write link). */
export const sourceAccessNames: Record<LinkAccess, string> = {
  read_only: 'Read only',
  publish_later: 'Editable download',
  write_through: 'Read and write link',
};

export const sourceProviderNames: Record<SourceProviderId, string> = {
  local: 'Local',
  sftp: 'SFTP',
  google_drive: 'Google Drive',
  globus: 'Globus',
  github: 'GitHub',
  obsidian: 'Obsidian',
  ndp: 'NDP endpoint',
  s3: 'S3',
};

/** A source row's sub-line parts: provider, a GitHub revision, then access (["GitHub", "main", "Read only"]). */
export function sourceSublineParts(source: ConnectedSourceState): string[] {
  const access = source.linked
    ? sourceAccessNames[source.link_access ?? 'read_only']
    : source.local_path
      ? source.download_access === 'editable'
        ? 'Editable download'
        : 'Read only'
      : sourceModeNames[source.mode ?? 'read_only'];
  return [
    sourceProviderNames[source.provider] ?? source.provider,
    source.provider === 'github' ? source.configuration.github_ref || undefined : undefined,
    access,
  ].filter((part): part is string => Boolean(part));
}

/** A source row's status word: what blocks it first, then work in progress, then edits. */
export function sourceStatus(source: ConnectedSourceState): {
  tone: StatusTone;
  label: string;
  /** Sign-in or permission is what the row needs from the person. */
  signIn?: boolean;
} {
  if (!source.connected) return { tone: 'error', label: 'Disconnected' };
  if (!source.authenticated && !source.access_without_signin)
    return {
      tone: 'error',
      label: source.account_authenticated ? 'Permission needed' : 'Sign-in needed',
      signIn: true,
    };
  if (source.materialization === 'transferring') return { tone: 'running', label: 'Downloading' };
  if (source.materialization === 'failed') return { tone: 'error', label: 'Download failed' };
  if (source.materialization === 'stale') return { tone: 'warning', label: 'Out of date' };
  if (source.pending_edits)
    return {
      tone: 'warning',
      label: `${source.pending_edits} ${source.pending_edits === 1 ? 'edit' : 'edits'}`,
    };
  return { tone: 'success', label: 'Ready' };
}
/** Format a source entry's size consistently in the source browser. */
export const sourceBytes = (value: number): string =>
  value >= 1024 ** 3
    ? `${(value / 1024 ** 3).toFixed(1)} GB`
    : value >= 1024 ** 2
      ? `${(value / 1024 ** 2).toFixed(1)} MB`
      : value >= 1024
        ? `${(value / 1024).toFixed(1)} KB`
        : `${value} B`;
