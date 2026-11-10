import type { ConnectedSourceState, SourceMode, SourceProviderId } from '@clio/core/v3';
import type { StatusTone } from './primitives/status-indicator';

/** The spec's three Access words, shared by the Access rows and every source sub-line. */
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

export const sourceModeDescriptions: Record<SourceMode, string | undefined> = {
  read_only: undefined,
  working_copy: linkAccessNames.publish_later,
  write_enabled: linkAccessNames.write_through,
};

/** The link access a source's chosen mode maps to when it is linked. */
export const sourceModeLinkAccess: Record<SourceMode, LinkAccess> = {
  read_only: 'read_only',
  working_copy: 'publish_later',
  write_enabled: 'write_through',
};

/** A link's access in the same three words as the Access rows. */
const accessNames: Record<LinkAccess, string> = {
  read_only: sourceModeNames.read_only,
  publish_later: sourceModeNames.working_copy,
  write_through: sourceModeNames.write_enabled,
};

export const sourceProviderNames: Record<SourceProviderId, string> = {
  local: 'Local',
  sftp: 'SFTP',
  google_drive: 'Google Drive',
  globus: 'Globus',
  github: 'GitHub',
  obsidian: 'Obsidian',
  ndp: 'NDP endpoint',
};

/** A source row's sub-line parts: provider, a GitHub revision, then access (["GitHub", "main", "Read only"]). */
export function sourceSublineParts(source: ConnectedSourceState): string[] {
  const access = source.linked
    ? accessNames[source.link_access ?? 'read_only']
    : source.local_path
      ? source.download_access === 'editable'
        ? sourceModeNames.working_copy
        : sourceModeNames.read_only
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

/** A vault's notes are read, or edited in place; it has no separate copy to publish from. */
export const vaultModes: readonly SourceMode[] = ['read_only', 'write_enabled'];
export const vaultReasons: Partial<Record<SourceMode, string>> = {
  working_copy: 'Vault notes are edited in place, so there is no copy to publish later.',
};
