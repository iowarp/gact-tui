import type { SubagentRun, ToolInvocation } from '@clio/core/v3';
import { getToolStatus } from './tool-presentation';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Resolve the recorded peer by exact handle/session identity, never message prose. */
export function agentMessageName(
  target: string | undefined,
  subagents: Record<string, SubagentRun> = {},
  sessionTitle?: string,
): string | undefined {
  if (!target) return undefined;
  const child =
    subagents[target] ?? Object.values(subagents).find((row) => row.child_session_id === target);
  return child?.title || sessionTitle || child?.agent_id || undefined;
}

/** Typed outgoing message arguments and its accepted mailbox receipt. */
export function sentAgentMessage(
  tool: ToolInvocation | undefined,
): { target: string; message: string; sessionId?: string; accepted: boolean } | undefined {
  if (!tool || tool.name !== 'send_agent_message') return undefined;
  const outer = record(tool.input);
  const input = record(outer?.kwargs) ?? outer;
  if (typeof input?.message !== 'string') return undefined;
  const target = input.target ?? input.task_id;
  if (typeof target !== 'string') return undefined;
  let output = tool.output;
  if (Array.isArray(output) && output.length === 1) output = record(output[0])?.text;
  if (typeof output === 'string') {
    try {
      output = JSON.parse(output);
    } catch {
      output = undefined;
    }
  }
  const result = record(output);
  const receipt = record(result?.structuredContent) ?? record(result?.structured_content) ?? result;
  return {
    target,
    message: input.message,
    accepted: receipt?.accepted === true,
    ...(typeof receipt?.session_id === 'string' ? { sessionId: receipt.session_id } : {}),
  };
}

/** Give an accepted send a readable, expandable message while retaining exact tool evidence. */
export function withAgentMessagePresentation(
  tool: ToolInvocation,
  recipient?: string,
): ToolInvocation {
  const message = sentAgentMessage(tool);
  if (!message) return tool;
  const status = getToolStatus(tool);
  const sent = status === 'succeeded' && message.accepted;
  const sending = status === 'running' || status === 'pending';
  return {
    ...tool,
    presentation: {
      ...tool.presentation,
      action: `${sent ? 'Sent message to' : sending ? 'Sending message to' : 'Send message to'} ${recipient || 'an agent'}`,
      subject: undefined,
      summary: '',
      blocks: [
        { id: 'agent-message-body', type: 'markdown', text: message.message },
        ...(tool.presentation?.blocks.filter((block) => block.severity === 'error') ?? []),
      ],
    },
  };
}
