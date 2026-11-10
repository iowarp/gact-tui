import type { Session } from '@clio/core/v3';
import type { UseQueryResult } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

/** The sessions a workspace view knows about, with the query fields its consumers read. */
export interface KnownSessions {
  data: Session[] | undefined;
  isPending: boolean;
  isPlaceholderData: boolean;
  refetch: () => Promise<unknown>;
}

/**
 * The open conversation's tree joined with the sessions waiting on a person.
 *
 * This replaces the list of every session the views used to load: everything
 * that reads it (the conversation tree, its children and parents, subagent
 * origins, attention under each root) needs only these two bounded sets, plus
 * any conversation a pending request names before its state says it waits. A
 * family row wins over a waiting row, and both over a request owner, for the
 * same session (the family is the one the open conversation polls).
 */
export function useKnownSessions(
  family: UseQueryResult<Session[]>,
  waiting: UseQueryResult<Session[]>,
  hasConversation: boolean,
  requestOwners?: readonly Session[],
): KnownSessions {
  const data = useMemo(
    () => mergeKnownSessions(family.data, waiting.data, requestOwners),
    [family.data, waiting.data, requestOwners],
  );
  const { refetch: refetchFamily } = family;
  const { refetch: refetchWaiting } = waiting;
  const refetch = useCallback(
    () => Promise.all([hasConversation ? refetchFamily() : undefined, refetchWaiting()]),
    [hasConversation, refetchFamily, refetchWaiting],
  );
  return {
    data,
    isPending: waiting.isPending || (hasConversation && family.isPending),
    isPlaceholderData: waiting.isPlaceholderData || family.isPlaceholderData,
    refetch,
  };
}

/** All sets, one row per session; `undefined` until the family or waiting list answers. */
export function mergeKnownSessions(
  family: readonly Session[] | undefined,
  waiting: readonly Session[] | undefined,
  requestOwners: readonly Session[] = [],
): Session[] | undefined {
  if (family === undefined && waiting === undefined) return undefined;
  const byId = new Map<string, Session>();
  for (const session of requestOwners) byId.set(session.id, session);
  for (const session of waiting ?? []) byId.set(session.id, session);
  for (const session of family ?? []) byId.set(session.id, session);
  return [...byId.values()];
}
