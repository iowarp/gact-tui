import type { ToolInvocation } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import '@/components/ai-elements/markdown';
import { ConversationTurn } from './conversation-turn';
import type { ConversationActivity, ConversationIteration } from './conversation-turn-model';

afterEach(cleanup);
function tool(id: string, title: string): ToolInvocation {
  return { id, session_id: 'session_1', name: id, title, state: 'succeeded' };
}
function activityLane(entries: readonly ConversationActivity[]): Partial<ConversationIteration> {
  return {
    activity: [...entries],
    tools: entries.flatMap((entry) => (entry.kind === 'tool' ? [entry.tool] : [])),
    tasks: [],
  };
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
describe('ConversationTurn Activity folding', () => {
  function activityHeader() {
    return screen.getByRole('button', { name: /Activity/u });
  }

  it('keeps tool entries collapsed while working and when the answer starts', () => {
    const { rerender } = render(
      <ConversationTurn
        iterations={[
          iteration(activityLane([{ kind: 'tool', id: 'read', tool: tool('read', 'Read') }])),
        ]}
        mode="chain"
        subagents={{}}
      />,
    );
    expect(activityHeader()).toHaveAttribute('aria-expanded', 'false');

    rerender(
      <ConversationTurn
        answerStarted
        iterations={[
          iteration(activityLane([{ kind: 'tool', id: 'read', tool: tool('read', 'Read') }])),
        ]}
        mode="chain"
        subagents={{}}
      />,
    );

    expect(activityHeader()).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a finished turn folded, and keeps the reader open once they open it', () => {
    const { rerender } = render(
      <ConversationTurn
        answerStarted
        iterations={[
          iteration(activityLane([{ kind: 'tool', id: 'read', tool: tool('read', 'Read') }])),
        ]}
        mode="chain"
        subagents={{}}
      />,
    );
    expect(activityHeader()).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(activityHeader());
    rerender(
      <ConversationTurn
        answerStarted
        iterations={[
          iteration(activityLane([{ kind: 'tool', id: 'read', tool: tool('read', 'Read') }])),
        ]}
        mode="chain"
        subagents={{}}
      />,
    );

    expect(activityHeader()).toHaveAttribute('aria-expanded', 'true');
  });
});
