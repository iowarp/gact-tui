import type { WorkspaceReference } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useHdf5ViewerSupported } from '@/hooks/use-hdf5-viewer-supported';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { QUERY_STALE_TIME_MS } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';

/**
 * `@run.h5::/entry/data` names one object inside an HDF5 file: the silx/NeXus
 * file-plus-object form (a single `:` would clash with Windows paths). The
 * reference id carries it as is, and the service resolves the object inside the
 * workspace (clio-agent `gact/context_reference_hdf5.py`).
 */
export const HDF5_LOCATOR_SEPARATOR = '::';
const HDF5_EXTENSIONS = ['h5', 'hdf5', 'he5', 'nxs'];
const HDF5_MEDIA_TYPE = 'application/x-hdf5';

export function isHdf5File(path: string): boolean {
  return HDF5_EXTENSIONS.includes(path.split('.').at(-1)?.toLowerCase() ?? '');
}

/** The file, the group being listed and the typed filter of a `file::/group/fil` mention. */
export interface Hdf5Mention {
  file: string;
  group: string;
  filter: string;
}

export function parseHdf5Mention(query: string): Hdf5Mention | undefined {
  const at = query.indexOf(HDF5_LOCATOR_SEPARATOR);
  if (at <= 0) return undefined;
  const file = query.slice(0, at);
  const inner = query.slice(at + HDF5_LOCATOR_SEPARATOR.length) || '/';
  if (!isHdf5File(file) || !inner.startsWith('/')) return undefined;
  const slash = inner.lastIndexOf('/');
  return { file, group: inner.slice(0, slash) || '/', filter: inner.slice(slash + 1) };
}

/** The mention text that lists a row's contents, or undefined when the row is not a container. */
export function hdf5DrillQuery(reference: WorkspaceReference): string | undefined {
  if (reference.kind !== 'workspace_file') return undefined;
  if (reference.navigation['hdf5_kind'] === 'group') return `${reference.id}/`;
  if (!reference.id.includes(HDF5_LOCATOR_SEPARATOR) && isHdf5File(reference.id)) {
    return `${reference.id}${HDF5_LOCATOR_SEPARATOR}/`;
  }
  return undefined;
}

interface GroupChild {
  name: string;
  kind: string;
  shape?: number[] | null;
  type?: { dtype?: string };
}

function childDetail(child: GroupChild): string {
  if (child.kind === 'dataset') {
    const shape = child.shape?.length ? child.shape.join('×') : 'scalar';
    return ['dataset', shape, child.type?.dtype].filter(Boolean).join(' · ');
  }
  if (child.kind === 'external_link') return 'link to another file';
  if (child.kind === 'soft_link') return 'link';
  return child.kind;
}

function childReference(mention: Hdf5Mention, child: GroupChild): WorkspaceReference {
  const locator = `${mention.group === '/' ? '' : mention.group}/${child.name}`;
  const name = mention.file.split('/').at(-1) ?? mention.file;
  return {
    kind: 'workspace_file',
    id: `${mention.file}${HDF5_LOCATOR_SEPARATOR}${locator}`,
    label: `${name} › ${locator}`,
    detail: childDetail(child),
    media_type: HDF5_MEDIA_TYPE,
    revision: '',
    navigation: { path: mention.file, locator, hdf5_kind: child.kind },
  };
}

/**
 * The objects in the group a `file::/group/` mention points at, filtered by the
 * text after its last `/`. Read through the h5grove route, so only metadata is
 * fetched and links never leave the workspace.
 */
export function useHdf5ReferenceRows(workspaceId: string, query: string) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const supported = useHdf5ViewerSupported();
  const mention = supported ? parseHdf5Mention(query) : undefined;
  const listing = useQuery({
    enabled: Boolean(workspaceId && mention),
    queryKey: queryKeys.key(
      'hdf5-reference-rows',
      settings.endpoint,
      workspaceId,
      mention?.file ?? '',
      mention?.group ?? '',
    ),
    queryFn: async ({ signal }) => {
      const bytes = await repository.readWorkspaceHdf5(
        workspaceId,
        'meta',
        { file: mention!.file, path: mention!.group },
        signal,
      );
      const meta = JSON.parse(new TextDecoder().decode(bytes)) as { children?: GroupChild[] };
      return meta.children ?? [];
    },
    staleTime: QUERY_STALE_TIME_MS,
  });
  const file = mention?.file;
  const group = mention?.group;
  const filter = mention?.filter.toLocaleLowerCase() ?? '';
  // Stable across renders: the menu reports its rows to the composer from an effect.
  const rows = useMemo(
    () =>
      file !== undefined && group !== undefined
        ? (listing.data ?? [])
            .filter((child) => child.name.toLocaleLowerCase().includes(filter))
            .map((child) => childReference({ file, group, filter }, child))
        : [],
    [file, filter, group, listing.data],
  );
  return { mention, rows, listing };
}
