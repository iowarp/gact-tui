import type { ServiceIntegrationHealth } from '@clio/core/v3';
import { vocab } from '@/lib/brand-vocabulary';
import { humanizeProtocolValue } from './presentation-labels';
import { t } from '@lingui/core/macro';

const { agent } = vocab;

/** The typed reason tokens (clio_agent.runtime.sandbox / sandbox_codex) worded specifically. */
const SANDBOX_REASON_LABELS: Record<string, string> = {
  codex_enforcement_unverified: t`Not verified yet on this computer`,
  sandbox_fence_pending_restart: t`Set up, restart ${agent} to activate`,
};

export function sandboxReasonLabel(reason: string): string {
  return SANDBOX_REASON_LABELS[reason] ?? humanizeProtocolValue(reason);
}

/** What `/v1/system/sandbox` (or the `/v1/health` `sandbox` row) says about the fence. */
export type SandboxVerdictRow = Pick<
  ServiceIntegrationHealth,
  | 'status'
  | 'required'
  | 'reason'
  | 'next_action'
  | 'summary'
  | 'active'
  | 'acknowledgement_required'
  | 'warning'
> & { resolved?: boolean; mechanism?: string };

export interface SandboxInactive {
  /** Changes when the verdict changes, so a new verdict asks again. */
  key: string;
  warning?: string;
  reason?: string;
  nextAction?: string;
}

/**
 * Whether this start must be acknowledged because agent commands run without
 * the OS write fence. `pending` while the server has not resolved its backend
 * (or nothing was read yet): show nothing until it has.
 */
export function sandboxVerdict(
  row: SandboxVerdictRow | undefined,
): 'pending' | 'active' | SandboxInactive {
  if (!row || row.resolved === false) return 'pending';
  const inactive =
    row.acknowledgement_required ??
    (row.active === undefined
      ? // An older server only has the doctor row's state.
        row.required !== false && row.status !== 'ready' && row.status !== 'healthy'
      : !row.active);
  if (!inactive) return 'active';
  return {
    key: [row.reason, row.mechanism, row.warning, row.next_action].join('\u0000'),
    warning: row.warning,
    reason: row.reason ? sandboxReasonLabel(row.reason) : row.summary,
    nextAction: row.next_action,
  };
}
