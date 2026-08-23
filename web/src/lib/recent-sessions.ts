import type { Session } from '@clio/core/v3'

const DEFAULT_RECENT_LIMIT = 8
const SEARCH_LIMIT = 20

export function visibleWorkspaceSessions(
  sessions: readonly Session[],
  workspaceId: string,
  activeSessionId: string,
  query: string,
  limit = DEFAULT_RECENT_LIMIT,
): Session[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const candidates = sessions
    .filter((session) => session.workspace_id === workspaceId)
    .filter((session) => !normalizedQuery || session.title.toLocaleLowerCase().includes(normalizedQuery))
    .toSorted((left, right) => right.updated_at.localeCompare(left.updated_at))
  if (normalizedQuery) return candidates.slice(0, SEARCH_LIMIT)
  const active = candidates.find((session) => session.id === activeSessionId)
  return [
    ...(active ? [active] : []),
    ...candidates.filter((session) => session.id !== activeSessionId),
  ].slice(0, limit)
}
