/**
 * Pure reducers for the in-flight tool-call list (the "running tools" spinner
 * row). Exports the {@link RunningTool} shape and the started/progress/completed
 * apply* helpers keyed by call id.
 */
export interface RunningTool {
  callId: string;
  toolName: string;
  startedAt: number;
  /** Optional progress 0..1 from `tool.call.progress` events. */
  progress?: number;
  /** Last status message from tool.call.progress. */
  progressMessage?: string;
}

export function applyRunningToolStarted(
  prev: RunningTool[],
  payload: Record<string, unknown>,
  now: () => number = Date.now,
): RunningTool[] {
  const toolName = (payload.tool_name as string) ?? 'tool';
  const callId =
    (payload.call_id as string) ?? (payload.tool_call_id as string) ?? `${toolName}-${now()}`;
  if (prev.some((tool) => tool.callId === callId)) return prev;
  return [...prev, { callId, toolName, startedAt: now() }];
}

export function applyRunningToolProgress(
  prev: RunningTool[],
  payload: Record<string, unknown>,
): RunningTool[] {
  const callId = (payload.call_id as string) ?? (payload.tool_call_id as string);
  if (!callId) return prev;
  const ratio = progressRatio(payload.progress, payload.total);
  const message = payload.message as string | undefined;
  return prev.map((tool) =>
    tool.callId === callId
      ? {
          ...tool,
          ...(ratio != null ? { progress: ratio } : {}),
          ...(message ? { progressMessage: message } : {}),
        }
      : tool,
  );
}

export function applyRunningToolCompleted(
  prev: RunningTool[],
  payload: Record<string, unknown>,
): RunningTool[] {
  const callId = (payload.call_id as string) ?? (payload.tool_call_id as string);
  return callId ? prev.filter((tool) => tool.callId !== callId) : prev;
}

function progressRatio(progress: unknown, total: unknown): number | undefined {
  if (typeof progress === 'number' && typeof total === 'number' && total > 0) {
    return Math.min(1, Math.max(0, progress / total));
  }
  if (typeof progress === 'number' && progress <= 1) {
    return Math.min(1, Math.max(0, progress));
  }
  return undefined;
}
