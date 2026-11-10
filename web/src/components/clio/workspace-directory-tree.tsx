import type { WorkspaceFileEntry, WorkspaceFileListing } from '@clio/core/v3';
import { skipToken, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useAppearancePreferences } from '@/providers/appearance-provider';
import { connectionScope } from '@/lib/connection-scope';
import { workspaceDirectoryQueryKey } from '@/lib/workspace-directory-cache';
import { FileTypeIcon } from './file-type-icon';
import { WindowedFileTree, type FileTreeRow } from './workbench-file-tree';
import type { ChangeCounts } from './workbench-shared';

interface TreeProps {
  directory?: string;
  workspaceId: string;
  root?: WorkspaceFileListing;
  selectedPath?: string;
  onSelect: (path: string) => void;
  filter?: string;
  changedPaths?: ReadonlySet<string>;
  changeCounts?: ChangeCounts;
}

interface DirectoryListing {
  entries: readonly WorkspaceFileEntry[];
  pending: boolean;
  error?: string;
  hasNext: boolean;
  fetchingNext: boolean;
  fetchNext: () => void;
}

/**
 * The paged Files tree. Each expanded folder mounts one directory query; their
 * pages flatten into a single windowed row list, so only rows in view mount.
 */
export function WorkspaceDirectoryTree(props: TreeProps) {
  const { settings } = useConnectionSettings();
  const client = useQueryClient();
  const expansionKey = useMemo(
    () => ['workspace-directory-expanded', connectionScope(settings), props.workspaceId],
    [settings, props.workspaceId],
  );
  const { data: expandedPaths } = useQuery<string[]>({
    queryKey: expansionKey,
    queryFn: skipToken,
    initialData: [],
    enabled: false,
    gcTime: Infinity,
  });
  const [listings, setListings] = useState<ReadonlyMap<string, DirectoryListing>>(() => new Map());
  const report = useCallback((directory: string, listing: DirectoryListing | undefined) => {
    setListings((current) => {
      const next = new Map(current);
      if (listing) next.set(directory, listing);
      else next.delete(directory);
      return next;
    });
  }, []);
  const toggle = useCallback(
    (path: string) => {
      const next = new Set(client.getQueryData<string[]>(expansionKey) ?? []);
      if (!next.delete(path)) next.add(path);
      client.setQueryData(expansionKey, [...next]);
    },
    [client, expansionKey],
  );

  const rootDirectory = props.directory ?? '';
  const { rows, loaded } = useMemo(() => {
    const expanded = new Set(expandedPaths);
    const result: FileTreeRow[] = [];
    const directories: string[] = [];
    const walk = (directory: string, depth: number) => {
      directories.push(directory);
      const listing = listings.get(directory);
      const entries = (listing?.entries ?? []).filter(
        (entry) =>
          entry.type === 'dir' ||
          !props.filter ||
          name(entry).toLocaleLowerCase().includes(props.filter),
      );
      const alignWithFolders = entries.some((entry) => entry.type === 'dir');
      for (const entry of entries) {
        if (entry.type !== 'dir') {
          result.push({
            kind: 'file',
            path: entry.path,
            name: name(entry),
            depth,
            alignWithFolders,
            size: entry.size,
            icon: (
              <FileTypeIcon className="size-3.5" mediaType={entry.media_type} name={entry.path} />
            ),
          });
          continue;
        }
        const open = expanded.has(entry.path);
        result.push({ kind: 'dir', path: entry.path, name: name(entry), depth, open });
        if (!open) continue;
        if (entry.redacted)
          result.push({
            kind: 'note',
            key: `${entry.path}#note`,
            depth: depth + 1,
            label: 'Sandbox cache contents are private.',
          });
        else walk(entry.path, depth + 1);
      }
      if (!listing || listing.pending)
        result.push({
          kind: 'loading',
          key: `${directory}#loading`,
          depth,
          label: 'Loading folder',
        });
      else if (listing.error)
        result.push({
          kind: 'note',
          key: `${directory}#error`,
          depth,
          label: listing.error,
          tone: 'error',
        });
      else if (!listing.entries.length)
        result.push({ kind: 'note', key: `${directory}#empty`, depth, label: 'Empty folder' });
      if (listing?.hasNext)
        result.push({
          kind: 'more',
          key: `${directory}#more`,
          depth,
          label: listing.fetchingNext ? 'Loading…' : 'Load more files',
          disabled: listing.fetchingNext,
          onActivate: listing.fetchNext,
        });
    };
    walk(rootDirectory, 0);
    return { rows: result, loaded: directories };
  }, [expandedPaths, listings, props.filter, rootDirectory]);

  return (
    <>
      {loaded.map((directory) => (
        <DirectoryLoader
          directory={directory}
          key={directory}
          onReport={report}
          root={directory === '' ? props.root : undefined}
          workspaceId={props.workspaceId}
        />
      ))}
      <WindowedFileTree
        changeCounts={props.changeCounts}
        changedPaths={props.changedPaths}
        onSelect={props.onSelect}
        onToggle={toggle}
        rows={rows}
        selectedPath={props.selectedPath}
      />
    </>
  );
}

/** Owns one folder's paged query and reports its rows; renders nothing. */
function DirectoryLoader({
  directory,
  workspaceId,
  root,
  onReport,
}: {
  directory: string;
  workspaceId: string;
  root?: WorkspaceFileListing;
  onReport: (directory: string, listing: DirectoryListing | undefined) => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const { hideDotFiles } = useAppearancePreferences();
  const listing = useInfiniteQuery({
    queryKey: workspaceDirectoryQueryKey(
      settings.endpoint,
      workspaceId,
      connectionScope(settings),
      directory,
      !hideDotFiles,
    ),
    initialPageParam: 0,
    initialData: root ? { pages: [root], pageParams: [0] } : undefined,
    queryFn: ({ signal, pageParam }) =>
      repository.workspaceFiles(workspaceId, signal, {
        directory,
        offset: pageParam,
        includeHidden: !hideDotFiles,
      }),
    getNextPageParam: (page) => page.next_offset ?? undefined,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
  const { data, isPending, error, hasNextPage, isFetchingNextPage, fetchNextPage } = listing;
  // Layout effects report before paint, so a listed folder never flashes as loading.
  useLayoutEffect(() => {
    onReport(directory, {
      entries: data?.pages.flatMap((page) => page.entries) ?? [],
      pending: isPending,
      error: error?.message,
      hasNext: hasNextPage,
      fetchingNext: isFetchingNextPage,
      fetchNext: () => void fetchNextPage(),
    });
  }, [data, directory, error, fetchNextPage, hasNextPage, isFetchingNextPage, isPending, onReport]);
  useLayoutEffect(() => () => onReport(directory, undefined), [directory, onReport]);
  return null;
}

function name(entry: WorkspaceFileEntry): string {
  return (entry.display_path ?? entry.path).split(/[\\/]/u).at(-1) ?? entry.path;
}
