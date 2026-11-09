import type { WorkspaceFileEntry, WorkspaceFileListing } from '@clio/core/v3';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';

/** One directory page of the lazy workspace tree. */
export function workspaceDirectoryQueryKey(
  endpoint: string,
  workspaceId: string,
  scope: string,
  directory: string,
  includeHidden: boolean,
) {
  return ['workspace-directory', endpoint, workspaceId, scope, directory, includeHidden] as const;
}

/**
 * A nested file's listing entry, from directories the tree has already
 * loaded. Reads the cache only, so opening a file costs no listing request.
 */
export function cachedWorkspaceFile(
  queryClient: QueryClient,
  endpoint: string,
  workspaceId: string,
  path: string,
): WorkspaceFileEntry | undefined {
  for (const [, data] of queryClient.getQueriesData<InfiniteData<WorkspaceFileListing>>({
    queryKey: ['workspace-directory', endpoint, workspaceId],
  })) {
    for (const page of data?.pages ?? []) {
      const entry = page.entries.find(
        (candidate) => candidate.type === 'file' && candidate.path === path,
      );
      if (entry) return entry;
    }
  }
  return undefined;
}
