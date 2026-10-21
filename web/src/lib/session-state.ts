import type { Session } from '@clio/core/v3';

/** A user branch owns its composer and interactions despite its provenance parent. */
export function isUserBranch(session: Pick<Session, 'session_kind'>): boolean {
  return session.session_kind === 'branch';
}

/** Managed children retain their parent relationship and their own follow-up target. */
export function isManagedChildSession(
  session: Pick<Session, 'parent_session_id' | 'session_kind'>,
): boolean {
  return Boolean(session.parent_session_id && !isUserBranch(session));
}

/** Only independent conversations can create user branches, including legacy roots. */
export function canForkSession(
  session: Pick<Session, 'parent_session_id' | 'session_kind'> | undefined,
): boolean {
  return Boolean(
    session &&
      session.session_kind !== 'agent' &&
      session.session_kind !== 'lookup' &&
      !isManagedChildSession(session),
  );
}

export function isSessionRunning(state: Session['state']): boolean {
  return state === 'queued' || state === 'running';
}

export function isSessionActive(state: Session['state']): boolean {
  return ['queued', 'running', 'waiting_permission', 'waiting_user'].includes(state);
}
