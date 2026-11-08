import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { WorkspaceFileRange } from '@clio/core/v3';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';
import { TEXT_WINDOW_CHUNK_BYTES, TEXT_WINDOW_MAX_BYTES } from '@/lib/runtime-limits';

/** Windows of a large file stay cached briefly; reopening it soon is cheap, the bytes do not linger. */
const TEXT_WINDOW_GC_TIME_MS = 30_000;

/** One ranged read of a file's head. */
export interface TextWindowPage {
  start: number;
  bytes: Uint8Array;
  /** The read reached the end of the file. */
  last: boolean;
  /** The service ignored `Range` and sent the whole file; `bytes` keeps only the bounded head. */
  rangeIgnored: boolean;
}

/** Read one head window, keeping no more than the window budget in memory. */
export async function readHeadWindow(
  read: (range: WorkspaceFileRange) => Promise<Uint8Array>,
  start: number,
  chunk = TEXT_WINDOW_CHUNK_BYTES,
  max = TEXT_WINDOW_MAX_BYTES,
): Promise<TextWindowPage> {
  // One byte more than the window tells a file that ends exactly here from a longer one.
  const bytes = await read({ start, end: start + chunk });
  if (bytes.length > chunk + 1) {
    // A whole-file answer: copy the head out so the full body can be collected.
    const whole = start === 0 && bytes.length <= max;
    return {
      start: 0,
      bytes: whole ? bytes : bytes.slice(0, max),
      last: whole,
      rangeIgnored: true,
    };
  }
  const last = bytes.length <= chunk;
  return { start, bytes: last ? bytes : bytes.subarray(0, chunk), last, rangeIgnored: false };
}

export interface TextHead {
  /** Complete lines read from the start of the file (all of it when `complete`). */
  text: string;
  loadedBytes: number;
  complete: boolean;
  /** No further window can be read: the budget is spent or the service cannot range. */
  capped: boolean;
}

/** Decode head windows as one stream, ending on a line boundary until the file is complete. */
export function decodeTextHead(
  pages: readonly TextWindowPage[],
  max = TEXT_WINDOW_MAX_BYTES,
): TextHead {
  const decoder = new TextDecoder();
  let text = '';
  let loadedBytes = 0;
  for (const page of pages) {
    text += decoder.decode(page.bytes, { stream: true });
    loadedBytes += page.bytes.length;
  }
  const lastPage = pages.at(-1);
  const complete = lastPage?.last ?? false;
  if (complete) return { text: text + decoder.decode(), loadedBytes, complete, capped: false };
  const lineEnd = text.lastIndexOf('\n');
  return {
    text: lineEnd >= 0 ? text.slice(0, lineEnd + 1) : text,
    loadedBytes,
    complete,
    capped: (lastPage?.rangeIgnored ?? false) || loadedBytes >= max,
  };
}

/** The last window of a file, from its first whole line. */
export function decodeTextTail(bytes: Uint8Array, chunk = TEXT_WINDOW_CHUNK_BYTES): string {
  const window = bytes.length > chunk ? bytes.subarray(bytes.length - chunk) : bytes;
  const text = new TextDecoder().decode(window);
  if (bytes.length < chunk) return text;
  const lineStart = text.indexOf('\n');
  return lineStart >= 0 ? text.slice(lineStart + 1) : text;
}

/**
 * A large or unsized workspace text file, read as ranged windows: the head
 * first, more on demand up to the window budget, and the end on request.
 */
export function useWorkspaceTextWindow(
  workspaceId: string,
  path: string,
  { enabled = true, tail = false }: { enabled?: boolean; tail?: boolean } = {},
) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const head = useInfiniteQuery({
    queryKey: queryKeys.workspaceFileWindow(settings.endpoint, workspaceId, path, 'head'),
    queryFn: ({ pageParam, signal }) =>
      readHeadWindow(
        (range) => repository.readWorkspaceFileRange(workspaceId, path, range, signal),
        pageParam,
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.last || lastPage.rangeIgnored) return undefined;
      const next = lastPage.start + lastPage.bytes.length;
      return pages.reduce((total, page) => total + page.bytes.length, 0) >= TEXT_WINDOW_MAX_BYTES
        ? undefined
        : next;
    },
    enabled,
    gcTime: TEXT_WINDOW_GC_TIME_MS,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const end = useQuery({
    queryKey: queryKeys.workspaceFileWindow(settings.endpoint, workspaceId, path, 'tail'),
    queryFn: async ({ signal }) => {
      const bytes = await repository.readWorkspaceFileRange(
        workspaceId,
        path,
        { suffix: TEXT_WINDOW_CHUNK_BYTES },
        signal,
      );
      // Keep a copy of only the window when the service sent the whole file.
      return bytes.length > TEXT_WINDOW_CHUNK_BYTES
        ? bytes.slice(bytes.length - TEXT_WINDOW_CHUNK_BYTES)
        : bytes;
    },
    enabled: enabled && tail,
    gcTime: TEXT_WINDOW_GC_TIME_MS,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = head;
  const fetchMore = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  const pages = head.data?.pages;
  const decoded = useMemo(() => (pages ? decodeTextHead(pages) : undefined), [pages]);
  const tailText = useMemo(() => (end.data ? decodeTextTail(end.data) : undefined), [end.data]);
  return {
    head: decoded,
    headError: head.error,
    // Absent while a window is in flight, so repeated end-of-list signals read it once.
    loadMore: hasNextPage && !isFetchingNextPage ? fetchMore : undefined,
    loadingMore: isFetchingNextPage,
    tail: tailText,
    tailError: end.error,
    tailLoading: end.isLoading,
  };
}
