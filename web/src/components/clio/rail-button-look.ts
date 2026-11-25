import type { AsyncProcess, PendingInteraction, SubagentRun } from '@clio/core/v3';
import type { SessionAttention } from '@/lib/session-attention';
import { t } from '@lingui/core/macro';

export type RailButtonLook =
  | { kind: 'waiting'; count: number; label: string }
  | { kind: 'failed'; count: number; label: string }
  | { kind: 'running'; count: number; label: string }
  | { kind: 'idle'; count: 0; label: string };

const WAITING = new Set(['input_required', 'waiting_permission', 'waiting_user']);
const RUNNING = new Set(['queued', 'running', 'working', 'recovering']);
const FAILED = new Set(['failed', 'interrupted']);

/** Live states of the conversation's work: processes when known, else child agents. */
function workStates(
  processes: readonly AsyncProcess[],
  subagents: readonly SubagentRun[],
): string[] {
  return processes.length
    ? processes.map((process) => process.live_state)
    : subagents.map((agent) => agent.state);
}

export function failedWorkCount(
  processes: readonly AsyncProcess[],
  subagents: readonly SubagentRun[],
): number {
  return workStates(processes, subagents).filter((state) => FAILED.has(state)).length;
}

/**
 * The rail button's four looks: a request waiting for the person wins, then
 * failed work the person has not yet seen in the rail, then running work, else
 * nothing. Waiting is the bell's own count for this conversation (`attention`), so
 * the two never disagree. Without it, a waiting task counts only when no pending
 * request already stands for it, as the bell's rule does: an ask is one, not two.
 */
export function railButtonLook({
  processes,
  subagents,
  interactions = [],
  attention,
  seenFailed = 0,
}: {
  processes: readonly AsyncProcess[];
  subagents: readonly SubagentRun[];
  interactions?: readonly PendingInteraction[];
  attention?: SessionAttention | null;
  seenFailed?: number;
}): RailButtonLook {
  const states = workStates(processes, subagents);
  const requests = new Set(
    interactions
      .filter(
        (interaction) =>
          interaction.status === 'pending' &&
          interaction.audience !== 'agent' &&
          interaction.requires_human_response !== false,
      )
      .map((interaction) => interaction.id),
  ).size;
  const waiting =
    attention !== undefined
      ? (attention?.total ?? 0)
      : requests || states.filter((state) => WAITING.has(state)).length;
  if (waiting) return { kind: 'waiting', count: waiting, label: t`${waiting} waiting for you` };
  const failed = states.filter((state) => FAILED.has(state)).length;
  if (failed > seenFailed) {
    const count = failed - seenFailed;
    return { kind: 'failed', count, label: t`${count} failed` };
  }
  const running = states.filter((state) => RUNNING.has(state)).length;
  if (running) return { kind: 'running', count: running, label: t`${running} running` };
  return { kind: 'idle', count: 0, label: t`Nothing running` };
}
