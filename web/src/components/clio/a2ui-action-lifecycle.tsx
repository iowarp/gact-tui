import { t } from '@lingui/core/macro';
import type { A2UIActionLifecycle, A2UISurface } from '@clio/core/v3';
import { actionControlLabel } from '@/lib/a2ui/surface-components';
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

function lifecycleLabel(lifecycle: A2UIActionLifecycle, surface?: A2UISurface): string {
  // The action's name is the producer's identifier, not copy: the person reads the
  // control they pressed, or plain words when it has no readable label.
  const control = actionControlLabel(surface, lifecycle.source_component_id);
  const name =
    lifecycle.action_name === 'approval.respond'
      ? t`Decision`
      : lifecycle.action_name === 'agent.submit'
        ? t`Selection`
        : control
          ? t({ message: `“${control}”`, comment: 'The label of the control the person pressed, quoted' })
          : t`Your choice`;
  switch (lifecycle.status) {
    case 'received':
      return t`${name} received by the agent`;
    case 'delivered':
      return t`${name} delivered to the agent's turn`;
    case 'consumed':
      return t`${name} recorded`;
    case 'failed': {
      const reason = lifecycle.reason;
      return reason ? t`${name} failed: ${reason}` : t`${name} failed`;
    }
    case 'duplicate':
      return t`${name} ignored as a duplicate`;
    case 'unknown':
      return t`${name} status unknown`;
    default: {
      const unhandled: never = lifecycle.status;
      void unhandled;
      return t`${name} status unknown`;
    }
  }
}

export function ClioA2UIActionLifecycle({
  lifecycle,
  surface,
}: {
  lifecycle?: A2UIActionLifecycle;
  /** The surface the action came from, to name the control that sent it. */
  surface?: A2UISurface;
}) {
  if (!lifecycle || lifecycle.action_name === 'VALIDATION_FAILED') return null;
  return (
    <div aria-live="polite" className="pt-2 text-xs" data-slot="a2ui-action-lifecycle">
      <ClioStatus
        label={lifecycleLabel(lifecycle, surface)}
        value={lifecycleStatusValue(lifecycle.status)}
      />
    </div>
  );
}
