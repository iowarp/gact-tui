/**
 * Type definitions for the projected multi-agent execution view:
 * `ProjectedExecutionNode` and its kinds (text/handoff/step/report).
 */
export interface ProjectedExecutionNode {
  kind: 'text' | 'handoff' | 'step' | 'report';
  agent: string;
  parent?: string;
  depth: number;
  text?: string;
  question?: string;
  toolName?: string;
  toolArgs?: unknown;
  observation?: unknown;
  isFinish?: boolean;
  reasoning?: string;
  structured?: unknown;
  /**
   * The REAL tool result, recovered from the dedicated `tool.call.completed`
   * event payload (`payload.result`). The `react.step.completed`
   * `observation` REDACTS the result to "[redacted]:N chars"; the unredacted
   * data lives only on `tool.call.completed`. Carried as a raw string so the
   * content-type renderer (toolResultContent) can classify it. */
  toolResult?: string;
  /** Whether the tool call reported an error (`tool.call.completed.is_error`). */
  toolError?: boolean;
  /** Wall-clock duration of the tool call in ms, when reported. */
  toolDurationMs?: number;
}
