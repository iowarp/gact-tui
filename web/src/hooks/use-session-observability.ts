import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useRepository } from './use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';

export function sessionObservabilityQueryKey(endpoint: string, sessionId: string) {
  return queryKeys.sessionObservability(endpoint, sessionId);
}

/** Session-scoped work, evidence, and retained-context snapshots. */
export function useSessionObservability(sessionId: string) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const enabled = Boolean(sessionId);
  const [historySession, setHistorySession] = useState<string | null>(null);
  const showHistory = historySession === sessionId;

  const diffs = useQuery({
    queryKey: queryKeys.sessionObservabilityDetail(settings.endpoint, sessionId, 'diffs'),
    queryFn: ({ signal }) => repository.sessionDiffs(sessionId, signal),
    enabled,
  });
  const contextFiles = useQuery({
    queryKey: queryKeys.sessionObservabilityDetail(settings.endpoint, sessionId, 'context-files'),
    queryFn: ({ signal }) => repository.contextFiles(sessionId, signal),
    enabled,
  });
  const contextFrames = useQuery({
    queryKey: queryKeys.sessionObservabilityDetail(settings.endpoint, sessionId, 'context-frames'),
    queryFn: ({ signal }) => repository.contextFrames(sessionId, signal),
    enabled,
  });
  const processes = useInfiniteQuery({
    queryKey: [
      ...queryKeys.sessionObservabilityDetail(settings.endpoint, sessionId, 'processes'),
      'direct',
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      repository.asyncProcessesPage(
        sessionId,
        { cursor: pageParam, activeOnly: true, includeDescendants: false },
        signal,
      ),
    getNextPageParam: (page) => page.cursor ?? undefined,
    enabled,
  });
  const history = useInfiniteQuery({
    queryKey: [
      ...queryKeys.sessionObservabilityDetail(settings.endpoint, sessionId, 'processes'),
      'direct',
      'history',
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      repository.asyncProcessesPage(
        sessionId,
        { cursor: pageParam, activeOnly: false, includeDescendants: false },
        signal,
      ),
    getNextPageParam: (page) => page.cursor ?? undefined,
    enabled: enabled && showHistory,
  });

  const workPages = {
    hasMore: Boolean(processes.hasNextPage),
    pending: processes.isFetchingNextPage,
    loadMore: () => processes.fetchNextPage({ throwOnError: true }),
    history: {
      visible: showHistory,
      toggle: () => setHistorySession((value) => (value === sessionId ? null : sessionId)),
      items: history.data?.pages.flatMap((page) => page.items) ?? [],
      hasMore: Boolean(history.hasNextPage),
      pending: history.isFetching,
      loadMore: () => history.fetchNextPage({ throwOnError: true }),
      error: history.error instanceof Error ? history.error.message : '',
    },
  };
  return { contextFiles, contextFrames, diffs, processes, workPages };
}
