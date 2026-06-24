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
}
