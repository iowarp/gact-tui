import type { WorkspaceFileEntry, WorkspaceFileListing } from '@clio/core/v3';
import { skipToken, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileTree, FileTreeFile, FileTreeFolder } from '@/components/ai-elements/file-tree';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useAppearancePreferences } from '@/providers/appearance-provider';
import { connectionScope } from '@/lib/connection-scope';
import { FileTypeIcon } from './file-type-icon';

interface TreeProps {
  workspaceId: string;
  root: WorkspaceFileListing;
  selectedPath?: string;
  onSelect: (path: string) => void;
  filter?: string;
}

/** Mounts directory queries only when the corresponding folder is expanded. */
export function WorkspaceDirectoryTree(props: TreeProps) {
  const { settings } = useConnectionSettings();
  const client = useQueryClient();
  const expansionKey = [
    'workspace-directory-expanded',
    connectionScope(settings),
    props.workspaceId,
  ];
  const { data: expandedPaths } = useQuery<string[]>({
    queryKey: expansionKey,
    queryFn: skipToken,
    initialData: [],
    enabled: false,
    gcTime: Infinity,
  });
  const expanded = new Set(expandedPaths);
  return (
    <FileTree
      className="rounded-none border-0 bg-transparent font-sans text-xs"
      expanded={expanded}
      onExpandedChange={(paths) => client.setQueryData(expansionKey, [...paths])}
      onSelect={props.onSelect}
      selectedPath={props.selectedPath}
    >
      <DirectoryChildren {...props} directory="" expanded={expanded} />
    </FileTree>
  );
}

function DirectoryChildren({
  directory,
  expanded,
  ...props
}: TreeProps & {
  directory: string;
  expanded: ReadonlySet<string>;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const { hideDotFiles } = useAppearancePreferences();
  const listing = useInfiniteQuery({
    queryKey: [
      'workspace-directory',
      settings.endpoint,
      props.workspaceId,
      connectionScope(settings),
      directory,
      !hideDotFiles,
    ],
    initialPageParam: 0,
    initialData: directory === '' ? { pages: [props.root], pageParams: [0] } : undefined,
    queryFn: ({ signal, pageParam }) =>
      repository.workspaceFiles(props.workspaceId, signal, {
        directory,
        offset: pageParam,
        includeHidden: !hideDotFiles,
      }),
    getNextPageParam: (page) => page.next_offset ?? undefined,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
  const entries = listing.data?.pages.flatMap((page) => page.entries) ?? [];
  return (
    <>
      {entries
        .filter(
          (entry) =>
            entry.type === 'dir' ||
            !props.filter ||
            name(entry).toLocaleLowerCase().includes(props.filter),
        )
        .map((entry) =>
          entry.type === 'dir' ? (
            <FileTreeFolder key={entry.path} path={entry.path} name={name(entry)}>
              {expanded.has(entry.path) ? (
                entry.redacted ? (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    Sandbox cache contents are private.
                  </p>
                ) : (
                  <DirectoryChildren {...props} directory={entry.path} expanded={expanded} />
                )
              ) : null}
            </FileTreeFolder>
          ) : (
            <FileTreeFile
              key={entry.path}
              name={name(entry)}
              path={entry.path}
              icon={<FileTypeIcon name={entry.path} mediaType={entry.media_type} />}
            />
          ),
        )}
      {listing.isPending ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">Loading folder…</p>
      ) : null}
      {listing.error ? (
        <p className="px-2 py-1 text-xs text-destructive" role="alert">
          {listing.error.message}
        </p>
      ) : null}
      {!listing.isPending && !listing.error && !entries.length ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">Empty folder</p>
      ) : null}
      {listing.hasNextPage ? (
        <Button
          className="my-1 h-7 w-full text-xs"
          size="sm"
          variant="ghost"
          disabled={listing.isFetchingNextPage}
          onClick={() => void listing.fetchNextPage()}
        >
          {listing.isFetchingNextPage ? 'Loading…' : 'Load more files'}
        </Button>
      ) : null}
    </>
  );
}

function name(entry: WorkspaceFileEntry): string {
  return (entry.display_path ?? entry.path).split(/[\\/]/u).at(-1) ?? entry.path;
}
