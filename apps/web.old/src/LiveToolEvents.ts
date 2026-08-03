/**
 * Reduces `tool.call.*` SSE events into the running-tools list and execution
 * trace. Exports {@link applyLiveToolEvent} and the {@link ToolEventHooks} contract.
 */
import {
  appendExecutionTranscriptEvent,
  type ExecutionTranscriptEvent,
} from './LiveExecutionEvents.js';
import {
  applyRunningToolCompleted,
  applyRunningToolProgress,
  applyRunningToolStarted,
  type RunningTool,
} from './LiveRunningTools.js';

export interface ToolEventHooks {
  setRunningTools: (n: RunningTool[] | ((p: RunningTool[]) => RunningTool[])) => void;
  setExecutionEvents?: (
    n: ExecutionTranscriptEvent[] | ((p: ExecutionTranscriptEvent[]) => ExecutionTranscriptEvent[]),
  ) => void;
}

export function applyLiveToolEvent(
  type: string | undefined,
  payload: Record<string, unknown>,
  hooks: ToolEventHooks,
): boolean {
  switch (type) {
    case 'tool.call.started':
      appendExecutionTranscriptEvent(type, payload, hooks);
      hooks.setRunningTools((prev) => applyRunningToolStarted(prev, payload));
      return true;
    case 'tool.call.progress':
      hooks.setRunningTools((prev) => applyRunningToolProgress(prev, payload));
      return true;
    case 'tool.call.completed':
      appendExecutionTranscriptEvent(type, payload, hooks);
      hooks.setRunningTools((prev) => applyRunningToolCompleted(prev, payload));
      return true;
    default:
      return false;
  }
}
