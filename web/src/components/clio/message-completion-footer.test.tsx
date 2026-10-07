import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { Message } from '@clio/core/v3';
import { MessageCompletionFooter } from './message-completion-footer';

afterEach(cleanup);
it('shows recorded turn usage and zero cost while omitting unreported facts', () => {
  const message: Message = {
    id: 'm',
    session_id: 's',
    role: 'assistant',
    created_at: '2026-10-06T12:00:00Z',
    completed_at: '2026-10-06T12:00:45Z',
    stop_reason: 'end_turn',
    blocks: [],
    usage: { input: 129000, output: 3000, cache_read: 0, cache_write: 0 },
    cost_usd: 0,
  };
  const view = render(
    <MessageCompletionFooter message={message} toolCount={10}>
      <button>Copy</button>
    </MessageCompletionFooter>,
  );
  expect(screen.getByText('Done')).toBeVisible();
  expect(view.container).toHaveTextContent('129K in / 3K out');
  expect(view.container).toHaveTextContent('$0');
  expect(view.container).toHaveTextContent('10 tool calls');
  view.rerender(
    <MessageCompletionFooter
      message={{ ...message, usage: undefined, cost_usd: undefined, stop_reason: 'cancelled' }}
      toolCount={0}
    >
      <button>Copy</button>
    </MessageCompletionFooter>,
  );
  expect(screen.getByText('Cancelled')).toBeVisible();
  expect(view.container).not.toHaveTextContent('in /');
  expect(view.container).not.toHaveTextContent('$0');
  expect(view.container).not.toHaveTextContent('tool calls');
  expect(screen.getByRole('button', { name: 'Copy' })).toBeVisible();
});
