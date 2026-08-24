import type { Session } from '@clio/core/v3';

export function isSessionRunning(state: Session['state']): boolean {
  return ['queued', 'running', 'waiting_permission', 'waiting_user'].includes(state);
}
