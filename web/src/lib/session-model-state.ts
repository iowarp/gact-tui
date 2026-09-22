import type { Session } from '@clio/core/v3';
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';

/** Mirror the backend's removal of a stale per-session model override. */
export function withoutSessionModelReference<T extends Session>(session: T): T {
  return { ...session, provider_id: undefined, model_id: undefined };
}

/** Remove stale model overrides from one cached session listing. */
export function withoutSessionModelReferences<T extends Session>(sessions: readonly T[]): T[] {
  return sessions.map(withoutSessionModelReference);
}

/** Remove stale model overrides from the normalized live session projection. */
export function withoutEntitySessionModelReferences<T extends Session>(
  sessions: Readonly<Record<string, T>>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(sessions).map(([id, session]) => [id, withoutSessionModelReference(session)]),
  );
}

/** Synchronize every cached session list with the backend's provider-swap semantics. */
export function clearCachedSessionModelReferences(
  queryClient: QueryClient,
  endpoint: string,
): void {
  queryClient.setQueriesData<Session[]>(
    { queryKey: queryKeys.key('sessions', endpoint) },
    (sessions) => (sessions ? withoutSessionModelReferences(sessions) : sessions),
  );
}
