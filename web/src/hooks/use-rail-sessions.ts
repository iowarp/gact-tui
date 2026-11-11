import type { Session } from '@clio/core/v3';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';
import { listState, type ListState } from '@/lib/list-state';
import { mergeRailSessions } from '@/lib/rail-sessions';
import { PRIMARY_SESSION_KINDS } from '@/lib/recent-sessions';
import { useRepository } from './use-repository';

/** Conversations per rail page; the server reads each page by range. */
export const RAIL_PAGE_SIZE = 30;

export interface RailSessions {
  /** Loaded conversations merged with live rows, newest interaction first. */
  sessions: Session[];
  /** Conversations in this workspace in all pages, when the server reports it. */
  total?: number;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  /** The first page is on its way and no page has arrived. */
  loading: boolean;
  /** The first page failed; only live rows, if any, are listed. */
  error?: unknown;
  /** The next page failed; `retry` asks for it again. */
  loadMoreError?: unknown;
  retry: () => void;
}

/**
 * How many conversations a folded workspace holds, without loading them: a
 * one-row page whose `total` the server counts. Invalidated with the rail pages.
 */
export function useRailSessionCount(workspaceId: string, enabled: boolean): number | undefined {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const count = useQuery({
    queryKey: queryKeys.key('session-pages', settings.endpoint, workspaceId, 'count'),
    // One row is cheaper to finish than to cancel and refetch on a remount.
    queryFn: () => repository.sessionPage({ workspaceId, kinds: PRIMARY_SESSION_KINDS, limit: 1 }),
    select: (page) => page.total ?? undefined,
    enabled: enabled && Boolean(workspaceId),
    refetchOnWindowFocus: false,
  });
  return count.data;
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
        { workspaceId, kinds: PRIMARY_SESSION_KINDS, limit: RAIL_PAGE_SIZE, cursor: pageParam },
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
  const { fetchNextPage, isFetchingNextPage, isFetchNextPageError, refetch } = pages;
  const firstPageFailed = pages.isError && !pages.data;
  return {
    sessions,
    total: total === null ? undefined : total,
    hasMore: Boolean(hasNextPage),
    loadingMore: isFetchingNextPage,
    loadMore: () => {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
    },
    loading: pages.isLoading,
    error: firstPageFailed ? pages.error : undefined,
    loadMoreError: isFetchNextPageError ? pages.error : undefined,
    retry: () => {
      if (isFetchNextPageError) void fetchNextPage();
      else void refetch();
    },
  };
}

/** Archived conversations the Archived dialog lists; one page, newest first. */
export const ARCHIVED_PAGE_SIZE = 100;

/**
 * The archived conversations of every workspace, read only while the Archived
 * dialog is open (`GET /v1/sessions?archived=true`). A live row wins over the
 * page's copy, so a restore leaves the list before the page is read again.
 */
export function useArchivedSessions(
  live: readonly Session[],
  enabled: boolean,
): { sessions: Session[]; state: ListState } {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const page = useQuery({
    queryKey: queryKeys.key('session-pages', settings.endpoint, 'archived'),
    queryFn: ({ signal }) =>
      repository.sessionPage(
        { kinds: PRIMARY_SESSION_KINDS, limit: ARCHIVED_PAGE_SIZE, archived: true },
        signal,
      ),
    select: (data) => data.sessions,
    enabled,
  });
  const sessions = useMemo(() => {
    const byId = new Map<string, Session>();
    for (const session of page.data ?? []) byId.set(session.id, session);
    for (const session of live) if (session.archived || byId.has(session.id)) byId.set(session.id, session);
    return [...byId.values()];
  }, [live, page.data]);
  return { sessions, state: listState(page) };
}
