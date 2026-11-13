import type { SourceMode } from '@clio/core/v3';
import type { DownloadAccess, LinkAccess } from './connected-source-labels';
import { t } from '@lingui/core/macro';

/** The spec's Access rows, shared by connecting a source and managing one. */
export type SourceAccess = 'read_only' | 'editable' | 'write';

export const sourceAccessRows: ReadonlyArray<{
  value: SourceAccess;
  label: string;
  detail?: string;
}> = [
  { value: 'read_only', label: t`Read only` },
  { value: 'editable', label: t`Editable download`, detail: t`Edit locally, publish later` },
  { value: 'write', label: t`Read and write link`, detail: t`Update originals on save` },
];

/** A new source's access is its mode: read only, a working copy, or write-enabled. */
export const accessModes: Record<SourceAccess, SourceMode> = {
  read_only: 'read_only',
  editable: 'working_copy',
  write: 'write_enabled',
};
export const modeAccess: Record<SourceMode, SourceAccess> = {
  read_only: 'read_only',
  working_copy: 'editable',
  write_enabled: 'write',
};

/** Access rows a provider's capabilities rule out, with the provider's own reason. */
export function unavailableAccess(provider: {
  capabilities: { supported_modes: SourceMode[]; unavailable_reasons?: Record<string, string> };
}): Partial<Record<SourceAccess, string>> {
  const result: Partial<Record<SourceAccess, string>> = {};
  for (const access of ['editable', 'write'] as const) {
    const mode = accessModes[access];
    if (!provider.capabilities.supported_modes.includes(mode))
      result[access] =
        provider.capabilities.unavailable_reasons?.[mode] ?? t`Not offered by this source`;
  }
  return result;
}

/** The spec's three Access rows, as the link access they ask for. */
export const accessLink: Record<SourceAccess, LinkAccess> = {
  read_only: 'read_only',
  editable: 'publish_later',
  write: 'write_through',
};
export const linkAccessRow: Record<LinkAccess, SourceAccess> = {
  read_only: 'read_only',
  publish_later: 'editable',
  write_through: 'write',
};
/** A downloaded copy is read only, or editable for either editing row. */
export const accessDownload = (access: SourceAccess): DownloadAccess =>
  access === 'read_only' ? 'read_only' : 'editable';
