import type { PendingInteraction, ToolInvocation } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationTurn } from './conversation-turn';
import type { ConversationActivity, ConversationIteration } from './conversation-turn-model';

vi.mock('./mcp-app-surface', () => ({
  McpAppHistoryLine: ({ toolName }: { toolName: string }) => <div>{`${toolName} closed`}</div>,
  McpAppSurface: ({ appInstanceId }: { appInstanceId: string }) => (
    <div data-testid="active-mcp-app">{appInstanceId}</div>
  ),
}));

afterEach(cleanup);

function activityLane(entries: readonly ConversationActivity[]): Partial<ConversationIteration> {
  return {
    activity: [...entries],
    tools: entries.flatMap((entry) => (entry.kind === 'tool' ? [entry.tool] : [])),
    tasks: entries.flatMap((entry) => (entry.kind === 'task' ? [entry.task] : [])),
  };
}

function tool(id: string, title: string): ToolInvocation {
  return { id, session_id: 'session_1', name: id, title, state: 'succeeded' };
}

function iteration(overrides: Partial<ConversationIteration> = {}): ConversationIteration {
  return {
    id: 'assistant_1:iteration:0',
    index: 0,
    agentId: 'main',
    thinking: [],
    nextThoughts: ['Resolve the region first.'],
    activity: [],
    tools: [],
    tasks: [],
    terminal: false,
    interrupted: false,
    streaming: false,
    summary: 'Resolve the region first.',
    ...overrides,
  };
}

describe("ConversationTurn: the agent's own questions in chain mode (#1448)", () => {
  it("puts the agent's pending question in the chain-mode log, answerable in place (#1448)", async () => {
    const onInteractionResponse = vi.fn().mockResolvedValue(undefined);
    const interaction: PendingInteraction = {
      id: 'question:native_pending',
      kind: 'question',
      owner_session_id: 'session_1',
      attended_session_id: 'session_1',
      status: 'pending',
      title: 'Question from agent',
      prompt: 'Which physical system should I simulate?',
      source: { protocol: 'native', tool_name: 'ask_user', invocation_id: 'call_ask' },
      created_at: '2026-09-03T00:00:00Z',
      payload: {
        question_kind: 'choice',
        options: [
          { label: 'Cantilever beam', value: 'beam' },
          { label: 'Fluid channel', value: 'fluid' },
        ],
      },
      actions: ['answer', 'cancel'],
    };
    render(
      <ConversationTurn
        interactions={[interaction]}
        iterations={[
          iteration(
            activityLane([{ kind: 'tool', id: 'call_ask', tool: tool('call_ask', 'Ask User') }]),
          ),
        ]}
        mode="chain"
        onInteractionResponse={onInteractionResponse}
        subagents={{}}
      />,
    );

    // Not folded into the collapsed chain summary: the card is in the log.
    expect(screen.getByText('Which physical system should I simulate?')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Fluid channel' }));
    expect(onInteractionResponse).toHaveBeenCalledWith(interaction, {
      action: 'answer',
      selected_options: ['fluid'],
    });
  });

  it('settles the answered question into the existing record in chain mode', () => {
    const interaction: PendingInteraction = {
      id: 'question:native_answered',
      kind: 'question',
      owner_session_id: 'session_1',
      attended_session_id: 'session_1',
      status: 'answered',
      answered_by: 'human',
      title: 'Question from agent',
      prompt: 'Which physical system should I simulate?',
      source: { protocol: 'native', tool_name: 'ask_user', invocation_id: 'call_ask' },
      created_at: '2026-09-03T00:00:00Z',
      payload: {
        options: [{ label: 'Fluid channel', value: 'fluid' }],
        answer_metadata: { selected_options: ['fluid'] },
      },
      actions: [],
    };
    render(
      <ConversationTurn
        interactions={[interaction]}
        iterations={[
          iteration(
            activityLane([{ kind: 'tool', id: 'call_ask', tool: tool('call_ask', 'Ask User') }]),
          ),
        ]}
        mode="chain"
        onInteractionResponse={vi.fn()}
        subagents={{}}
      />,
    );

    expect(screen.queryByText('Agent asked')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }));
    fireEvent.click(screen.getByRole('button', { name: /Ask User/u }));
    expect(screen.getByText('Agent asked')).toBeVisible();
    expect(screen.getAllByText('You responded')).toHaveLength(2);
    expect(screen.getByText('Fluid channel')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Fluid channel' })).not.toBeInTheDocument();
  });
});
