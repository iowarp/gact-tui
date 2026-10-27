import type { ClioRepository, Session } from '@clio/core/v3';
import { PRIMARY_SESSION_KINDS } from './recent-sessions';

/** Conversations a settings picker offers: the newest page, never every session. */
export const SETTINGS_SESSION_PAGE = 100;

/**
 * The newest page of conversations (in one workspace, or all), plus the named
 * sessions a view must be able to show even when they are older (a selection, a
 * granted target). One page and one by-id read; no list of every session.
 */
export async function recentSessionsWith(
  repository: Pick<ClioRepository, 'sessionPage' | 'sessionsById'>,
  options: { workspaceId?: string; ids?: readonly (string | undefined)[]; limit?: number },
  signal?: AbortSignal,
): Promise<Session[]> {
  const ids = [...new Set((options.ids ?? []).filter((id): id is string => Boolean(id)))];
  const [page, named] = await Promise.all([
    repository.sessionPage(
      {
        workspaceId: options.workspaceId,
        kinds: PRIMARY_SESSION_KINDS,
        limit: options.limit ?? SETTINGS_SESSION_PAGE,
      },
      signal,
    ),
    ids.length ? repository.sessionsById(ids, signal) : Promise.resolve([]),
  ]);
  const byId = new Map<string, Session>();
  for (const session of [...page.sessions, ...named]) byId.set(session.id, session);
  return [...byId.values()];
}
