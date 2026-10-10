import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { Message, ToolInvocation } from '@clio/core/v3';
import { MessageCompletionFooter } from './message-completion-footer';
import { messageToolCallCounts } from './message-tool-call-counts';

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
  expect(view.container).not.toHaveTextContent('·');
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

it('withholds stale completion metadata while the owning turn is still active', () => {
  const view = render(
    <MessageCompletionFooter message={message} toolCount={1} active>
      <button>Copy</button>
    </MessageCompletionFooter>,
  );
  expect(view.container).toBeEmptyDOMElement();
  view.rerender(
    <MessageCompletionFooter message={message} toolCount={1}>
      <button>Copy</button>
    </MessageCompletionFooter>,
  );
  expect(screen.getByText('Done')).toBeVisible();
});

const message: Message = {
  id: 'failed-turn',
  session_id: 's',
  role: 'assistant',
  created_at: '2026-10-08T00:00:00Z',
  completed_at: '2026-10-08T00:01:00Z',
  stop_reason: 'completed',
  blocks: [],
};

it('shows failures with the total in the footer and handles a single call', () => {
  const view = render(
    <MessageCompletionFooter message={message} toolCount={8} failedToolCount={4}>
      <button>Copy</button>
    </MessageCompletionFooter>,
  );
  expect(screen.getByText('8 (4 failed) tool calls')).toBeVisible();
  expect(view.container).not.toHaveTextContent('·');
  view.rerender(
    <MessageCompletionFooter message={message} toolCount={1} failedToolCount={1}>
      <button>Copy</button>
    </MessageCompletionFooter>,
  );
  expect(screen.getByText('1 (1 failed) tool call')).toBeVisible();
});

it('deduplicates recorded calls and counts semantic failures rather than unrelated session tools', () => {
  const call = (id: string, state: ToolInvocation['state'] = 'succeeded'): ToolInvocation => ({
    id,
    session_id: 's',
    name: 'fs_read_file',
    state,
  });
  const tools: Record<string, ToolInvocation> = {
    success: call('success'),
    failed: call('failed', 'failed'),
    semantic: {
      ...call('semantic'),
      presentation: { status: 'failed', summary: 'Failed', blocks: [] },
    },
    denied: {
      ...call('denied'),
      presentation: { status: 'denied', summary: 'Denied', blocks: [] },
    },
    cancelled: call('cancelled', 'cancelled'),
    partial: {
      ...call('partial'),
      presentation: { status: 'degraded', summary: 'Partial', blocks: [] },
    },
    unrelated: call('unrelated', 'failed'),
  };
  expect(
    messageToolCallCounts(
      {
        ...message,
        blocks: [
          { id: 'answer', type: 'text', text: 'Completed.' },
          ...[
            'success',
            'failed',
            'semantic',
            'denied',
            'cancelled',
            'partial',
            'missing',
            'failed',
          ].map((tool_id, index) => ({ id: `b${index}`, type: 'tool' as const, tool_id })),
        ],
      },
      tools,
    ),
  ).toEqual({ toolCount: 7, failedToolCount: 2 });
});

it('does not present unfinished calls as final turn statistics', () => {
  const view = render(
    <MessageCompletionFooter
      message={{ ...message, completed_at: undefined, stop_reason: undefined }}
      toolCount={8}
      failedToolCount={4}
    >
      <button>Copy</button>
    </MessageCompletionFooter>,
  );
  expect(view.container).not.toHaveTextContent('tool calls');
  expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
  expect(view.container).toBeEmptyDOMElement();
});
