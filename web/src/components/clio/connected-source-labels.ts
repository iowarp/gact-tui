import type { ConnectedSourceState, SourceMode, SourceProviderId } from '@clio/core/v3';
import type { StatusTone } from './primitives/status-indicator';
import { plural, t } from '@lingui/core/macro';

/** An entry as the provider names it; `path` may be a portable alias of that name. */
export function sourceEntryName(entry: { path: string; remote_path?: string }): string {
  return entry.remote_path || entry.path;
}

/** A source's configured access, named as the Access choice names it. */
export const sourceModeNames: Record<SourceMode, string> = {
  read_only: t`Read only`,
  working_copy: t`Editable download`,
  write_enabled: t`Read and write link`,
};

export type LinkAccess = 'read_only' | 'publish_later' | 'write_through';
export type DownloadAccess = 'read_only' | 'editable';

export const linkAccessNames: Record<LinkAccess, string> = {
  read_only: t`Read only`,
  publish_later: t`Edit locally, publish later`,
  write_through: t`Update originals on save`,
};

/** The access choice's own name (spec Access: Read only, Editable download, Read and write link). */
export const sourceAccessNames: Record<LinkAccess, string> = {
  read_only: t`Read only`,
  publish_later: t`Editable download`,
  write_through: t`Read and write link`,
};

export const sourceProviderNames: Record<SourceProviderId, string> = {
  local: 'Local',
  sftp: 'SFTP',
  // i18n-ignore: product name
  google_drive: 'Google Drive',
  globus: 'Globus',
  github: 'GitHub',
  obsidian: 'Obsidian',
  ndp: t`NDP endpoint`,
  s3: 'S3',
};

/** A source's access word, as its sub-line names it. */
function sourceAccessName(source: ConnectedSourceState): string {
  return source.linked
    ? sourceAccessNames[source.link_access ?? 'read_only']
    : source.local_path
      ? source.download_access === 'editable'
        ? t`Editable download`
        : t`Read only`
      : sourceModeNames[source.mode ?? 'read_only'];
}

/** The access word short enough to sit beside the provider in a narrow list. */
const narrowAccessNames: Record<string, string> = {
  'Editable download': 'Editable',
  'Edit locally, publish later': 'Editable',
  'Read and write link': 'Read/write',
  'Update originals on save': 'Read/write',
};

/** A source row's sub-line parts: provider, a GitHub revision, then access (["GitHub", "main", "Read only"]). */
export function sourceSublineParts(source: ConnectedSourceState): string[] {
  return [
    sourceProviderNames[source.provider] ?? source.provider,
    source.provider === 'github' ? source.configuration.github_ref || undefined : undefined,
    sourceAccessName(source),
  ].filter((part): part is string => Boolean(part));
}

/**
 * The same parts for a narrow list, index for index: the revision is left out (null) and
 * the access word shortened, so what the source may do stays in view.
 */
export function sourceNarrowSublineParts(
  source: ConnectedSourceState,
): (string | null | undefined)[] {
  const parts = sourceSublineParts(source);
  return parts.map((part, index) =>
    index === parts.length - 1 ? narrowAccessNames[part] : index > 0 ? null : undefined,
  );
}

/** A source row's status word: what blocks it first, then work in progress, then edits. */
export function sourceStatus(source: ConnectedSourceState): {
  tone: StatusTone;
  label: string;
  /** Sign-in or permission is what the row needs from the person. */
  signIn?: boolean;
} {
  if (!source.connected) return { tone: 'error', label: t`Disconnected` };
  if (!source.authenticated && !source.access_without_signin)
    return {
      tone: 'error',
      label: source.account_authenticated ? t`Permission needed` : t`Sign-in needed`,
      signIn: true,
    };
  if (source.materialization === 'transferring') return { tone: 'running', label: t`Downloading` };
  if (source.materialization === 'failed') return { tone: 'error', label: t`Download failed` };
  if (source.materialization === 'stale') return { tone: 'warning', label: t`Out of date` };
  if (source.pending_edits)
    return {
      tone: 'warning',
      label: plural(source.pending_edits, { one: '# edit', other: '# edits' }),
    };
  return { tone: 'success', label: t`Ready` };
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
