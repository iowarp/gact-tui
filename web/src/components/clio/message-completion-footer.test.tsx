import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { Message, ToolInvocation } from '@clio/core/v3';
import { MessageCompletionFooter } from './message-completion-footer';
import { messageToolCallCounts } from './message-tool-call-counts';
import { replyUsedRows } from './message-reply-facts';

afterEach(cleanup);
it('shows the model, tokens and duration of a finished answer, with details in the reply card', () => {
  const message: Message = {
    id: 'm',
    session_id: 's',
    role: 'assistant',
    created_at: '2026-10-06T12:00:00Z',
    completed_at: '2026-10-06T12:00:45Z',
    stop_reason: 'end_turn',
    blocks: [{ id: 'answer', type: 'text', text: 'The result is ready.', channel: 'answer' }],
    model: { provider_id: 'openai', model_id: 'gpt-5' },
    usage: { input: 129000, output: 3000, cache_read: 15100, cache_write: 0 },
    cost_usd: 0,
    metadata: {
      behavior: { execution_mode: 'plan', reasoning_effort: 'xhigh', confirmation_policy: 'ask' },
    },
  };
  const view = render(
    <MessageCompletionFooter agentName="Researcher" message={message} toolCount={10}>
      <button>Copy</button>
    </MessageCompletionFooter>,
  );
  expect(screen.getByText('gpt-5')).toBeVisible();
  expect(view.container).toHaveTextContent('129K in, 3K out');
  expect(view.container).toHaveTextContent('45s');
  expect(view.container).not.toHaveTextContent('Done');
  expect(view.container).not.toHaveTextContent('tool calls');
  expect(view.container).not.toHaveTextContent('·');
  expect(screen.getByRole('button', { name: 'Copy' })).toBeVisible();

  const { setup, usage } = replyUsedRows(message, 'Researcher', { toolCount: 10 });
  const facts = (rows: typeof setup) => rows.map(({ label, value }) => [label, value]);
  expect(facts(setup)).toEqual([
    ['Agent', 'Researcher'],
    ['Model', expect.stringContaining('/ gpt-5')],
    ['Mode', 'Plan'],
    ['Reasoning', 'Extra high'],
    ['Permissions', 'Ask first'],
  ]);
  expect(facts(usage)).toEqual([
    ['Tokens', '129K in, 3K out, 15.1K cached'],
    ['Cost', '$0'],
    ['Tools', '10 tool calls'],
    ['Time', '45s'],
  ]);

  view.rerender(
    <MessageCompletionFooter
      message={{ ...message, usage: undefined, cost_usd: undefined, stop_reason: 'cancelled' }}
      toolCount={0}
    >
      <button>Copy</button>
    </MessageCompletionFooter>,
  );
  // A stop is said in words, muted: it is not a failure.
  expect(screen.getByText('Stopped')).toBeVisible();
  expect(screen.getByText('Stopped')).not.toHaveClass('text-destructive');
  expect(view.container).not.toHaveTextContent('in,');
  expect(screen.getByRole('button', { name: 'Copy' })).toBeVisible();
});

it('omits card rows the message does not record', () => {
  const { setup, usage } = replyUsedRows(message, undefined, { toolCount: 0 });
  expect(setup.map(({ label }) => label)).toEqual(['Agent']);
  expect(usage.map(({ label }) => label)).toEqual(['Time']);
  expect(replyUsedRows(message, 'main', { toolCount: 0 }).setup[0]!.value).not.toBe('main');
});

it('says a failed reply failed, in words', () => {
  render(
    <MessageCompletionFooter message={{ ...message, stop_reason: 'error' }} toolCount={0}>
      <button>Copy</button>
    </MessageCompletionFooter>,
  );
  expect(screen.getByText('Failed')).toHaveClass('text-destructive');
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
  expect(screen.getByText('1m')).toBeVisible();
});

const message: Message = {
  id: 'failed-turn',
  session_id: 's',
  role: 'assistant',
  created_at: '2026-10-08T00:00:00Z',
  completed_at: '2026-10-08T00:01:00Z',
  stop_reason: 'completed',
  blocks: [{ id: 'answer', type: 'text', text: 'The result is ready.', channel: 'answer' }],
};

it('counts failed tool calls in the reply card', () => {
  expect(
    replyUsedRows(message, undefined, { toolCount: 8, failedToolCount: 4 }).usage[0]?.value,
  ).toBe('8 tool calls, 4 failed');
  expect(
    replyUsedRows(message, undefined, { toolCount: 1, failedToolCount: 1 }).usage[0]?.value,
  ).toBe('1 tool call, 1 failed');
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
  expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
  expect(view.container).toBeEmptyDOMElement();
});

it.each([
  { name: 'empty boundary', blocks: [] },
  { name: 'tool handoff', blocks: [{ id: 'tool', type: 'tool', tool_id: 'call' }] },
  {
    name: 'ongoing update',
    blocks: [
      { id: 'update', type: 'text', channel: 'next_thought', text: 'Inspecting the files.' },
    ],
  },
] satisfies { name: string; blocks: Message['blocks'] }[])(
  'omits a completion footer for an $name without an answer',
  ({ blocks }) => {
    const view = render(
      <MessageCompletionFooter message={{ ...message, blocks }} toolCount={1}>
        <button>Copy</button>
      </MessageCompletionFooter>,
    );
    expect(view.container).toBeEmptyDOMElement();
  },
);
