import type { Session, SubagentRun } from '@clio/core/v3';

/**
 * The transitive closure of session ids related to `sessionId` through
 * subagent parent->child links (`SubagentRun.child_session_id`) and session
 * `parent_session_id` links -- every session a subagent canvas can render
 * inline. Extracted from `useWorkspaceData` (S1 item A2 follow-up) so it is
 * directly unit-testable without rendering the whole hook.
 */
export function computeInteractionSessionIds(
  sessionId: string,
  subagents: Iterable<Pick<SubagentRun, 'session_id' | 'child_session_id'>>,
  sessions: Iterable<Pick<Session, 'id' | 'parent_session_id'>>,
): Set<string> {
  const subagentList = [...subagents];
  const sessionList = [...sessions];
  const related = new Set([sessionId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const subagent of subagentList) {
      if (
        subagent.child_session_id &&
        related.has(subagent.session_id) &&
        !related.has(subagent.child_session_id)
      ) {
        related.add(subagent.child_session_id);
        changed = true;
      }
    }
    for (const candidate of sessionList) {
      if (
        candidate.parent_session_id &&
        related.has(candidate.parent_session_id) &&
        !related.has(candidate.id)
      ) {
        related.add(candidate.id);
        changed = true;
      }
    }
  }
  return related;
}

/**
 * Every session id a mounted A2UI surface can reference: the open session
 * itself, any session whose pending interaction owns a surface
 * (`a2uiOwnerIds`), and the open session's own subagent/child closure
 * (`interactionSessionIds`, {@link computeInteractionSessionIds}) -- the id
 * set `useA2uiSessionRegistry` fetches catalogs for (S1 item A2). Never only
 * the "open" session id: a surface belonging to a subagent canvas or a
 * pending interaction owned by a child session previously read a
 * lazily-created, never-populated registry entry that nothing ever
 * resolved, staying on "Resolving the interactive catalog…" forever.
 */
export function computeA2uiReferencedSessionIds(
  sessionId: string,
  a2uiOwnerIds: readonly string[],
  interactionSessionIds: Iterable<string>,
): string[] {
  return [...new Set([sessionId, ...a2uiOwnerIds, ...interactionSessionIds])];
}
