import type { AgentBlueprintReference, Session } from '@clio/core/v3';

export function isSessionRunning(state: Session['state']): boolean {
  return state === 'queued' || state === 'running';
}

export function isSessionActive(state: Session['state']): boolean {
  return ['queued', 'running', 'waiting_permission', 'waiting_user'].includes(state);
}

/**
 * True for a top-level session (no parent) running the unblueprinted main
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
      !session.parent_session_id &&
      !activeBlueprint &&
      (!session.agent_id || session.agent_id === 'main'),
  );
}
