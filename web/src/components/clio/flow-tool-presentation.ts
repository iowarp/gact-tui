import type { ToolInvocation } from '@clio/core/v3';

/** The tools that start a flow as owned work and return its task handle at acceptance. */
const FLOW_TOOLS = new Set(['run_flow', 'run_workflow']);

export interface FlowToolDescriptor {
  /** The flow id: `workflow` for run_workflow, otherwise the flow the model named. */
  flow: string;
  label: string;
  /** The accepted task that runs the flow; absent until the start is accepted. */
  handle?: string;
  /**
   * Present when the start was refused before acceptance (for example
   * `workflow_invalid`, or `flow_not_trusted` with the step whose flow is not trusted).
   */
  refusal?: { reason: string; message: string; step?: string };
  /**
   * What the agent wrote when it started the flow: run_workflow's workflow, task and
   * editing bounds, or run_flow's input and options.
   */
  args?: Record<string, unknown>;
}

/** Read a run_flow / run_workflow invocation without inventing a flow or a handle. */
export function flowToolDescriptor(
  tool: ToolInvocation | undefined,
): FlowToolDescriptor | undefined {
  if (!tool || !FLOW_TOOLS.has(tool.name)) return undefined;
  const input = asRecord(tool.input);
  const kwargs = asRecord(input?.kwargs) ?? input;
  const result = findAcceptance(tool.output);
  const named = typeof kwargs?.flow === 'string' ? kwargs.flow.trim() : '';
  const flow =
    tool.name === 'run_workflow'
      ? 'workflow'
      : typeof result?.flow === 'string' && result.flow
        ? result.flow
        : named;
  const handle =
    result?.accepted === true && typeof result.handle === 'string' && result.handle
      ? result.handle
      : undefined;
  const refusal =
    result && result.accepted === false
      ? {
          reason: typeof result.reason === 'string' ? result.reason : 'not_accepted',
          message: typeof result.error === 'string' ? result.error : 'The flow did not start.',
          ...(typeof result.step === 'string' && result.step ? { step: result.step } : {}),
        }
      : undefined;
  return { flow: flow || 'flow', label: flowLabel(flow), handle, refusal, args: kwargs };
}

/** A person-facing name for a flow id. */
export function flowLabel(flow: string): string {
  if (!flow) return 'Flow';
  return flow.charAt(0).toUpperCase() + flow.slice(1).replaceAll(/[-_]/gu, ' ');
}

function findAcceptance(value: unknown, depth = 0): Record<string, unknown> | undefined {
  if (depth > 6) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined;
    try {
      return findAcceptance(JSON.parse(trimmed), depth + 1);
    } catch {
      return undefined;
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAcceptance(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  if (typeof record.accepted === 'boolean') return record;
  for (const child of Object.values(record)) {
    const found = findAcceptance(child, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
