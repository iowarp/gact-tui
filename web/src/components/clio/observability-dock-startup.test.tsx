import type { Message } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ClioTurnPreparation } from './turn-preparation';

afterEach(cleanup);
const user: Message = {
  id: 'user',
  session_id: 's',
  role: 'user',
  run_id: 'current',
  created_at: '2026-10-06T12:00:00Z',
  blocks: [{ id: 'u', type: 'text', text: 'Next question' }],
};
const previous: Message = {
  ...user,
  id: 'old',
  role: 'assistant',
  run_id: 'previous',
  created_at: '2026-10-06T11:59:59Z',
  blocks: [{ id: 'a', type: 'text', text: 'Previous answer', streaming: true }],
};

it('prepares the current turn until its first token and never flashes back between tools', () => {
  const props = { activeTurnId: 'current', sessionState: 'running' as const };
  const { rerender } = render(<ClioTurnPreparation {...props} messages={[previous, user]} />);
  expect(screen.getByRole('status')).toHaveTextContent('Preparing next response');
  const assistant: Message = {
    ...user,
    id: 'assistant',
    role: 'assistant',
    created_at: '2026-10-06T12:00:01Z',
    blocks: [{ id: 'empty', type: 'reasoning', text: '', streaming: true }],
  };
  rerender(<ClioTurnPreparation {...props} messages={[previous, user, assistant]} />);
  expect(screen.getByRole('status')).toBeVisible();
  assistant.blocks = [{ id: 'first', type: 'reasoning', text: 'Let', streaming: true }];
  rerender(<ClioTurnPreparation {...props} messages={[previous, user, assistant]} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  rerender(<ClioTurnPreparation {...props} activeTurnResponded messages={[previous, user]} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('uses observed setup phases and closes feedback when tool-only content precedes its run id', () => {
  const props = { activeTurnId: 'current', sessionState: 'queued' as const };
  const { rerender } = render(
    <ClioTurnPreparation
      {...props}
      messages={[user]}
      dependencies={[
        {
          id: 's:mcp:geo',
          session_id: 's',
          category: 'mcp',
          namespace: 'geo',
          title: 'Geo MCP',
          phase: 'launch',
          state: 'running',
          attempt: 1,
          max_attempts: 3,
          observed_active: true,
        },
      ]}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Setting up environment (loading MCP Geo)');
  const tool: Message = {
    ...user,
    id: 'tool',
    role: 'assistant',
    run_id: undefined,
    created_at: '2026-10-06T12:00:01Z',
    blocks: [{ id: 'tool_block', type: 'tool', tool_id: 'load_skill' }],
  };
  rerender(<ClioTurnPreparation {...props} messages={[previous, user, tool]} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  rerender(<ClioTurnPreparation {...props} sessionState="waiting_user" messages={[user]} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
