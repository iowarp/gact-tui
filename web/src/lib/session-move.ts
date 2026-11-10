import { TransportError, type Session } from '@clio/core/v3';
import { isManagedChildSession } from '@/lib/session-state';

/** Conversations and user branches move; agent and side sessions travel with their conversation. */
export function canMoveSession(
  session: Pick<Session, 'parent_session_id' | 'session_kind'> | undefined,
): boolean {
  if (!session) return false;
  const kind = session.session_kind ?? 'conversation';
  return (kind === 'conversation' || kind === 'branch') && !isManagedChildSession(session);
}

/** The words for a refused move, from the service's error code. */
export function sessionMoveFailure(error: unknown): Error {
  if (!(error instanceof TransportError)) {
    return error instanceof Error ? error : new Error(String(error));
  }
  switch (error.code) {
    case 'session_has_active_work':
      return new Error('Still working. Move it when it finishes.', {
        cause: error,
      });
    case 'move_not_allowed':
      return new Error('Agent and side conversations move with the conversation they belong to.', {
        cause: error,
      });
    case 'not_found':
      return new Error('This conversation or that workspace is no longer available.', {
        cause: error,
      });
    default:
      return error;
  }
}

/** Where the service says the conversation came from, when it recorded the move. */
export function movedFromWorkspace(session: Session): string | undefined {
  const move = session.metadata?.last_workspace_move;
  if (!move || typeof move !== 'object') return undefined;
  const from = (move as { from_workspace_id?: unknown }).from_workspace_id;
  return typeof from === 'string' ? from : undefined;
}
