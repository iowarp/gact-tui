import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConversationTurn } from './conversation-turn';
import type { ConversationIteration } from './conversation-turn-model';

afterEach(cleanup);

function iteration(overrides: Partial<ConversationIteration> = {}): ConversationIteration {
  return {
    id: 'assistant_1:iteration:0',
    index: 0,
    agentId: 'main',
    thinking: [],
    nextThoughts: ['Resolve the region first.'],
    tools: [],
    terminal: false,
    interrupted: false,
    streaming: false,
    summary: 'Resolve the region first.',
    ...overrides,
  };
}

describe('ConversationTurn incomplete state', () => {
  it('shows the interrupted state of a cancelled turn in full mode', () => {
    render(
      <ConversationTurn
        iterations={[iteration({ interrupted: true })]}
        mode="full"
        subagents={{}}
      />,
    );

    expect(screen.getByText('Interrupted')).toBeVisible();
  });

  it('shows the interrupted state on the collapsed chain summary', () => {
    render(
      <ConversationTurn
        iterations={[iteration({ interrupted: true })]}
        mode="chain"
        subagents={{}}
      />,
    );

    expect(screen.getByText('Interrupted')).toBeVisible();
  });

  it('does not mark a normally completed iteration as interrupted', () => {
    render(
      <ConversationTurn iterations={[iteration({ terminal: true })]} mode="full" subagents={{}} />,
    );

    expect(screen.queryByText('Interrupted')).not.toBeInTheDocument();
  });
});
