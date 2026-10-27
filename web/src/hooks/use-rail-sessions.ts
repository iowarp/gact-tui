import type { Session } from '@clio/core/v3';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';
import { mergeRailSessions } from '@/lib/rail-sessions';
import { useRepository } from './use-repository';

/** Conversations per rail page; the server reads each page by range. */
export const RAIL_PAGE_SIZE = 30;
const RAIL_KINDS = ['conversation', 'branch'] as const;

export interface RailSessions {
  /** Loaded conversations merged with live rows, newest interaction first. */
  sessions: Session[];
  /** Conversations in this workspace in all pages, when the server reports it. */
  total?: number;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
}

/**
 * The rail's conversations of one workspace, a page at a time.
 *
 * Pages come from `GET /v1/sessions?limit=&cursor=&kinds=conversation,branch`.
 * Rows the live stream or other lists already hold (`live`) win over a page's
 * copy, so a rename, a new message or an archive shows without refetching pages
 * (see `mergeRailSessions`).
 */
export function useRailSessions(
  workspaceId: string,
  live: readonly Session[],
  enabled: boolean,
): RailSessions {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const pages = useInfiniteQuery({
    queryKey: queryKeys.key('session-pages', settings.endpoint, workspaceId, 'rail'),
    queryFn: ({ pageParam, signal }) =>
      repository.sessionPage(
        { workspaceId, kinds: RAIL_KINDS, limit: RAIL_PAGE_SIZE, cursor: pageParam },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: enabled && Boolean(workspaceId),
  });
  const { hasNextPage } = pages;
  const sessions = useMemo(
    () =>
      mergeRailSessions(
        pages.data?.pages.flatMap((page) => page.sessions),
        live,
        workspaceId,
        Boolean(hasNextPage),
      ),
    [hasNextPage, live, pages.data, workspaceId],
  );
  const total = pages.data?.pages[0]?.total ?? undefined;
  const { fetchNextPage, isFetchingNextPage } = pages;
  return {
    sessions,
    total: total === null ? undefined : total,
    hasMore: Boolean(hasNextPage),
    loadingMore: isFetchingNextPage,
    loadMore: () => {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
    },
  };
}
