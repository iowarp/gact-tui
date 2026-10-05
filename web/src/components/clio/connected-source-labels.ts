import type { SourceMode } from '@clio/core/v3';

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
/** Format a source entry's size consistently in the source browser. */
export const sourceBytes = (value: number): string =>
  value >= 1024 ** 3
    ? `${(value / 1024 ** 3).toFixed(1)} GB`
    : value >= 1024 ** 2
      ? `${(value / 1024 ** 2).toFixed(1)} MB`
      : value >= 1024
        ? `${(value / 1024).toFixed(1)} KB`
        : `${value} B`;
