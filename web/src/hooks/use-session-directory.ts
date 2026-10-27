import type { Session } from '@clio/core/v3';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useRepository } from './use-repository';

/** Sessions a view names by id, read by id (`GET /v1/sessions?ids=`) as it shows them. */
export interface SessionDirectory {
  /** The session, once read; `undefined` until then or when it does not exist. */
  get: (sessionId: string) => Session | undefined;
  /** Ask for these sessions (call from an effect when they are shown). */
  request: (sessionIds: readonly string[]) => void;
}

/**
 * Resolve the sessions a view shows by id instead of loading every session to
 * look a few of them up. Requested ids accumulate; one query reads them.
 */
export function useSessionDirectory(): SessionDirectory {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [ids, setIds] = useState<readonly string[]>([]);
  const known = useQuery({
    queryKey: queryKeys.key('session-directory', settings.endpoint, ...ids),
    queryFn: ({ signal }) => repository.sessionsById(ids, signal),
    enabled: ids.length > 0,
    placeholderData: keepPreviousData,
  });
  const byId = useMemo(
    () => new Map((known.data ?? []).map((session) => [session.id, session])),
    [known.data],
  );
  const request = useCallback(
    (wanted: readonly string[]) =>
      setIds((current) => {
        const added = wanted.filter((id) => id && !current.includes(id));
        return added.length ? [...current, ...new Set(added)].toSorted() : current;
      }),
    [],
  );
  const get = useCallback((sessionId: string) => byId.get(sessionId), [byId]);
  return { get, request };
}
