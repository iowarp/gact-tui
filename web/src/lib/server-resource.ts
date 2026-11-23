import { decodeEventEnvelope } from '@clio/core/v3';
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

/** The live event a watched server resource sends when the server announces it changed. */
export const SERVER_RESOURCE_UPDATED = 'mcp.resource.updated';

/** The read of one resource on a server a conversation mounts. */
export function serverResourceQueryKey(
  endpoint: string,
  sessionId: string,
  namespace: string,
  uri: string,
) {
  return queryKeys.key('mcp-server-resource', endpoint, sessionId, namespace, uri);
}

/**
 * Rereads what a live frame says changed: the one resource an update names, or
 * every resource the conversation reads after a gap in its stream.
 */
export function rereadServerResourcesForFrame(
  queryClient: QueryClient,
  endpoint: string,
  frame: { eventName?: string; data: unknown },
  sessionId: string,
): void {
  if (frame.eventName === 'stream.gap') {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.key('mcp-server-resource', endpoint, sessionId),
    });
    return;
  }
  if (frame.eventName !== SERVER_RESOURCE_UPDATED) return;
  let payload: unknown;
  try {
    payload = decodeEventEnvelope(frame.data).payload;
  } catch {
    return;
  }
  const { namespace, uri } = (payload ?? {}) as { namespace?: unknown; uri?: unknown };
  if (typeof namespace !== 'string' || typeof uri !== 'string') return;
  void queryClient.invalidateQueries({
    queryKey: serverResourceQueryKey(endpoint, sessionId, namespace, uri),
  });
}
