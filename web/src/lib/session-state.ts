import type { AgentBlueprintReference, Session } from '@clio/core/v3';

/** A user branch owns its composer and interactions despite its provenance parent. */
export function isUserBranch(session: Pick<Session, 'session_kind'>): boolean {
  return session.session_kind === 'branch';
}

/** Managed children are followed from their parent rather than independently edited. */
export function isManagedChildSession(
  session: Pick<Session, 'parent_session_id' | 'session_kind'>,
): boolean {
  return Boolean(session.parent_session_id && !isUserBranch(session));
}

export function isSessionRunning(state: Session['state']): boolean {
  return state === 'queued' || state === 'running';
}

export function isSessionActive(state: Session['state']): boolean {
  return ['queued', 'running', 'waiting_permission', 'waiting_user'].includes(state);
}

/**
 * True for an independent conversation running the unblueprinted main
 * agent — the "Base agent" fallback label shown wherever the active
 * blueprint would otherwise appear (the in-page session context bar, the
 * desktop title bar's blueprint badge). Shared so both stay in sync rather
 * than drifting on separately-maintained copies of the same condition.
 */
export function showsBaseAgent(
  session: Session | undefined,
  activeBlueprint: AgentBlueprintReference | undefined,
): boolean {
  return Boolean(
    session &&
      !isManagedChildSession(session) &&
      !activeBlueprint &&
      (!session.agent_id || session.agent_id === 'main'),
  );
}
