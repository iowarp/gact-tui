import type { Message } from '@clio/core/v3';

/** Keep response feedback scoped to this run, with the user boundary as a legacy fallback. */
export function currentTurnAssistantMessages(
  messages: readonly Message[],
  activeTurnId?: string,
): Message[] {
  const latestUser = messages.findLast((message) => message.role === 'user');
  const currentRunId = activeTurnId ?? latestUser?.run_id ?? latestUser?.turn_id;
  return messages.filter((message) => {
    if (message.role !== 'assistant') return false;
    const runId = message.run_id ?? message.turn_id;
    if (runId && currentRunId) return runId === currentRunId;
    return !latestUser || Date.parse(message.created_at) >= Date.parse(latestUser.created_at);
  });
}
