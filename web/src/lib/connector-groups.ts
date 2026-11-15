/**
 * Discover's catalog entries by domain (clio-agent LZ-D9). Every server of the pinned
 * clio-kit is a connector now, so the list is long: entries are shown under the group
 * their catalog entry names ("Data formats", "HPC", "Earth science"), in the order the
 * groups first appear, with the entries that name none last under "Other".
 */
import type { Connector } from '@clio/core/v3';
import { t } from '@lingui/core/macro';

export interface CatalogGroup<T> {
  key: string;
  label: string;
  entries: T[];
}

/** `entries` grouped by their connector's `group`, groups alphabetical, ungrouped last. */
export function groupCatalogEntries<T extends { connector: Pick<Connector, 'group'> }>(
  entries: readonly T[],
): CatalogGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const key = entry.connector.group ?? '';
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    .map(([key, rows]) => ({ key: key || 'other', label: key || t`Other`, entries: rows }));
}

/**
 * Whether Yours lists a connector: a clio-kit connector is yours once it is enabled;
 * until then it is in Discover. Every other catalog entry is listed as before (CN12).
 */
export function listedInYours(connector: Pick<Connector, 'kit' | 'enabled'>): boolean {
  return !connector.kit || connector.enabled;
}
