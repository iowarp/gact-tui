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
  const name = lifecycle.action_name === 'approval.respond'
    ? 'Decision'
    : lifecycle.action_name === 'agent.submit' ? 'Selection' : lifecycle.action_name;
  switch (lifecycle.status) {
    case 'received':
      return `${name} received by the agent`;
    case 'delivered':
      return `${name} delivered to the agent's turn`;
    case 'consumed':
      return `${name} recorded`;
    case 'failed':
      return lifecycle.reason
        ? `${name} failed: ${lifecycle.reason}`
        : `${name} failed`;
    case 'duplicate':
      return `${name} ignored as a duplicate`;
    case 'unknown':
      return `${name} status unknown`;
    default: {
      const unhandled: never = lifecycle.status;
      void unhandled;
      return `${name} status unknown`;
    }
  }
}

export function ClioA2UIActionLifecycle({ lifecycle }: { lifecycle?: A2UIActionLifecycle }) {
  if (!lifecycle || lifecycle.action_name === 'VALIDATION_FAILED') return null;
  return (
    <div aria-live="polite" className="border-t px-4 py-2 text-xs">
      <ClioStatus label={lifecycleLabel(lifecycle)} value={lifecycleStatusValue(lifecycle.status)} />
    </div>
  );
}
