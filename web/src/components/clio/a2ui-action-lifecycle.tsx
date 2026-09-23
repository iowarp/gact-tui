import type { A2UIActionLifecycle } from '@clio/core/v3';
import { ClioStatus, type ClioStatusValue } from './status';

/**
 * Renders the server-truth footer for a surface's most recent action
 * (`a2ui.action.received|delivered|consumed|failed|duplicate`, dispatcher
 * slice S5) — words for every state, never a dot or colour alone, replacing
 * the deleted `acceptedActionLabel`/`/lastAction` data-model reader
 * (`docs/design/a2ui-compat-campaign-2026-09.md` S6 deletion inventory).
 */
function lifecycleStatusValue(status: A2UIActionLifecycle['status']): ClioStatusValue {
  switch (status) {
    case 'received':
      return 'queued';
    case 'delivered':
      return 'running';
    case 'consumed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'duplicate':
      return 'cancelled';
    case 'unknown':
      return 'unavailable';
    default: {
      const unhandled: never = status;
      void unhandled;
      return 'unavailable';
    }
  }
}

function lifecycleLabel(lifecycle: A2UIActionLifecycle): string {
  switch (lifecycle.status) {
    case 'received':
      return `${lifecycle.action_name} received by the agent`;
    case 'delivered':
      return `${lifecycle.action_name} delivered to the agent's turn`;
    case 'consumed':
      return `${lifecycle.action_name} applied`;
    case 'failed':
      return lifecycle.reason
        ? `${lifecycle.action_name} failed: ${lifecycle.reason}`
        : `${lifecycle.action_name} failed`;
    case 'duplicate':
      return `${lifecycle.action_name} ignored as a duplicate`;
    case 'unknown':
      return `${lifecycle.action_name} status unknown`;
    default: {
      const unhandled: never = lifecycle.status;
      void unhandled;
      return `${lifecycle.action_name} status unknown`;
    }
  }
}

export function ClioA2UIActionLifecycle({ lifecycle }: { lifecycle?: A2UIActionLifecycle }) {
  if (!lifecycle) return null;
  return (
    <div aria-live="polite" className="border-t px-4 py-2 text-xs">
      <ClioStatus label={lifecycleLabel(lifecycle)} value={lifecycleStatusValue(lifecycle.status)} />
    </div>
  );
}
