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
