import type { Session } from '@clio/core/v3';
import { vi } from 'vitest';

type SessionSource = () => unknown;

/**
 * Test stand-ins for the bounded session reads (`sessionPage`, `sessionFamily`,
 * `sessionsWaitingOnPerson`, `sessionsById`), answered from one test-owned list
 * the way the service answers them from its index.
 */
export function sessionReads(source: SessionSource) {
  const all = async (): Promise<Session[]> => {
    const rows = ((await source()) as Session[] | undefined) ?? [];
    return [...new Map(rows.map((row) => [row.id, row])).values()];
  };
  const rootOf = (rows: readonly Session[], id: string): string => {
    const byId = new Map(rows.map((row) => [row.id, row]));
    let current = id;
    const seen = new Set<string>();
    while (byId.get(current)?.parent_session_id && !seen.has(current)) {
      seen.add(current);
      current = byId.get(current)?.parent_session_id ?? current;
    }
    return current;
  };
  return {
    sessionPage: vi.fn(
      async (input: {
        workspaceId?: string;
        kinds?: readonly string[];
        limit: number;
        search?: string;
      }) => {
        const rows = (await all()).filter(
          (row) =>
            !row.archived &&
            (!input.workspaceId || row.workspace_id === input.workspaceId) &&
            (!input.kinds || input.kinds.includes(String(row.session_kind ?? 'conversation'))) &&
            (!input.search || row.title.toLowerCase().includes(input.search.toLowerCase())),
        );
        return {
          sessions: rows.slice(0, input.limit),
          next_cursor: rows.length > input.limit ? 'next-page' : null,
          total: rows.length,
        };
      },
    ),
    sessionFamily: vi.fn(async (sessionId: string) => {
      const rows = await all();
      const root = rootOf(rows, sessionId);
      return rows.filter((row) => rootOf(rows, row.id) === root);
    }),
    sessionsWaitingOnPerson: vi.fn(async () =>
      (await all()).filter(
        (row) => row.state === 'waiting_user' || row.state === 'waiting_permission',
      ),
    ),
    sessionsById: vi.fn(async (ids: readonly string[]) =>
      (await all()).filter((row) => ids.includes(row.id)),
    ),
  };
}
