import { PROTOCOL_VERSION, type RunState, type ToolState } from '@clio/core/v3';

/** Counts authoritative work that can still advance without inventing progress. */
export function countActiveWork(
  runs: readonly { state: RunState }[],
  tasks: readonly { state: RunState }[],
  tools: readonly { state: ToolState }[],
): number {
  return (
    runs.filter(({ state }) => state === 'running' || state === 'queued').length +
    tasks.filter(({ state }) => state === 'running' || state === 'queued').length +
    tools.filter(({ state }) => state === 'running' || state === 'pending').length
  );
}

/** Keeps live connectivity independent from a failed historical snapshot. */
export function canOpenSessionStream(
  gactVersions: readonly string[] | undefined,
  sessionId: string,
) {
  return Boolean(sessionId && gactVersions?.includes(PROTOCOL_VERSION));
}

/** Surfaces the service's own failure text; `details` stays display-only metadata. */
export function conversationUnavailableMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}
