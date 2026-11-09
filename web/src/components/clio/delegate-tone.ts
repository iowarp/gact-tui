import type { RunState } from '@clio/core/v3';
import type { StatusTone } from './primitives/status-indicator';

/** A delegate's state as the row's status mark. */
export function delegateTone(state: RunState): StatusTone {
  switch (state) {
    case 'queued':
    case 'running':
    case 'recovering':
    case 'stopping':
    case 'cancellation_requested':
    case 'pause_requested':
      return 'running';
    case 'waiting_permission':
    case 'waiting_user':
      return 'waiting';
    case 'completed':
      return 'success';
    case 'failed':
    case 'recovery_required':
      return 'error';
    case 'cancelled':
    case 'interrupted':
    case 'stopped':
      return 'stopped';
    case 'paused':
    case 'yielded':
      return 'idle';
    default:
      return 'warning';
  }
}
