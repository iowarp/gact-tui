import type { PendingInteraction } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  questionInteractionRequestLabel,
  questionInteractionsForTask,
  questionInteractionsForTool,
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

    expect(questionInteractionsForTool([second, first], 'invoke-1')).toEqual([first, second]);
    expect(questionInteractionsForTask([second, first], 'mcp-task')).toEqual([first, second]);
    expect(questionInteractionRequestLabel(second)).toBe('Form request 2 of 2');
  });

  it('retains a directly human-addressed MCP request after it is answered', () => {
    const answeredByHuman: PendingInteraction = {
      id: 'mcp_task_input:human',
      kind: 'mcp_task_input',
      owner_session_id: 'owner',
      attended_session_id: 'root',
      task_id: 'mcp-task',
      status: 'answered',
      title: 'MCP request',
      answered_by: 'human',
      source: { protocol: 'mcp', invocation_id: 'invoke-1' },
      created_at: '2026-09-03T00:00:03Z',
      payload: { mode: 'form', request_index: 1, request_count: 1 },
    };

    expect(questionInteractionsForTool([answeredByHuman], 'invoke-1')).toEqual([answeredByHuman]);
    expect(questionInteractionsForTask([answeredByHuman], 'mcp-task')).toEqual([answeredByHuman]);
  });

  it('retains an answered native ask-user question under its tool call', () => {
    const native: PendingInteraction = {
      id: 'question:native',
      kind: 'question',
      owner_session_id: 'owner',
      attended_session_id: 'owner',
      status: 'answered',
      title: 'Question from agent',
      answered_by: 'human',
      source: { protocol: 'native', tool_name: 'ask_user', invocation_id: 'call-native' },
      created_at: '2026-09-03T00:00:04Z',
      payload: { answer_metadata: { answer: 'A cantilever beam' } },
    };

    expect(questionInteractionsForTool([native], 'call-native')).toEqual([native]);
    expect(questionInteractionRequestLabel(native)).toBe('Question');
  });
});
