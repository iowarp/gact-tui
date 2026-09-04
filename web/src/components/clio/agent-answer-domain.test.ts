import type { PendingInteraction } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  agentInteractionRequestLabel,
  agentInteractionsForTask,
  agentInteractionsForTool,
} from './agent-answer-domain';

function interaction(
  id: string,
  index: number,
  routing: PendingInteraction['routing_state'] = 'elicitation_routed_to_agent',
): PendingInteraction {
  return {
    id,
    kind: 'mcp_task_input',
    owner_session_id: 'owner',
    attended_session_id: 'root',
    task_id: 'mcp-task',
    status: 'pending',
    title: 'MCP request',
    audience: 'agent',
    routing_state: routing,
    source: { protocol: 'mcp', invocation_id: 'invoke-1' },
    created_at: `2026-09-03T00:00:0${index}Z`,
    payload: { mode: 'form', request_index: index, request_count: 2 },
  };
}

describe('agent MCP interaction correlation', () => {
  it('retains every ordered request, including a fallback that became human-addressed', () => {
    const second = interaction('question:second', 2, 'agent_elicitation_fallback_to_human');
    const first = interaction('question:first', 1);

    expect(agentInteractionsForTool([second, first], 'invoke-1')).toEqual([first, second]);
    expect(agentInteractionsForTask([second, first], 'mcp-task')).toEqual([first, second]);
    expect(agentInteractionRequestLabel(second)).toBe('Form request 2 of 2');
  });
});
