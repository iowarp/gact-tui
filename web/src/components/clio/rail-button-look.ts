import type { AsyncProcess, PendingInteraction, SubagentRun } from '@clio/core/v3';

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
 * nothing. Pending questions and permissions count as waiting so the button
 * carries what the top bar's question pill used to show.
 */
export function railButtonLook({
  processes,
  subagents,
  interactions = [],
  seenFailed = 0,
}: {
  processes: readonly AsyncProcess[];
  subagents: readonly SubagentRun[];
  interactions?: readonly PendingInteraction[];
  seenFailed?: number;
}): RailButtonLook {
  const states = workStates(processes, subagents);
  const waiting =
    interactions.filter(
      (interaction) => interaction.status === 'pending' && interaction.audience !== 'agent',
    ).length + states.filter((state) => WAITING.has(state)).length;
  if (waiting) return { kind: 'waiting', count: waiting, label: `${waiting} waiting for you` };
  const failed = states.filter((state) => FAILED.has(state)).length;
  if (failed > seenFailed) {
    const count = failed - seenFailed;
    return { kind: 'failed', count, label: `${count} failed` };
  }
  const running = states.filter((state) => RUNNING.has(state)).length;
  if (running) return { kind: 'running', count: running, label: `${running} running` };
  return { kind: 'idle', count: 0, label: 'Nothing running' };
}
