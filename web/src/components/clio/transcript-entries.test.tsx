import type { Message, ToolInvocation } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import '@/components/ai-elements/markdown';
import { ConversationTurn } from './conversation-turn';
import {
  conversationTurnPresentation,
  type ConversationIteration,
} from './conversation-turn-model';
import { ClioConversation } from './conversation';
import { ClioToolInvocation } from './tool-invocation';
import { TranscriptTestAppearance as AppearanceProvider } from '@/test/transcript-test-appearance';
import { ClioMotionProvider } from './motion';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { TranscriptDisclosures } from './transcript-disclosures';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });

function call(id: string, state: ToolInvocation['state'] = 'succeeded'): ToolInvocation {
  return {
    id,
    session_id: 's',
    name: 'fs_read_file',
    title: `Read ${id}`,
    state,
    input: { path: `${id}.md` },
    output: `Complete ${id} result.`,
  };
}
function iteration(id: string, index: number, streaming = false): ConversationIteration {
  const tool = call(id, streaming ? 'running' : 'succeeded');
  return {
    id,
    index,
    agentId: 'main',
    thinking: [
      {
        id: `${id}:reasoning`,
        text: `Private recorded ${id} reasoning.\n\nAdditional evidence for ${id}.`,
        label: 'Thinking',
        streaming,
      },
    ],
    nextThoughts: [`Public ${id} update.`],
    activity: [{ kind: 'tool', id, tool }],
    tools: [tool],
    tasks: [],
    terminal: false,
    interrupted: false,
    streaming,
    summary: id,
  };
}
const message: Message = {
  id: 'm',
  session_id: 's',
  role: 'assistant',
  created_at: '2026-10-08T00:00:00Z',
  blocks: [
    { id: 'r1', type: 'reasoning', text: 'Recorded reasoning.' },
    { id: 'u1', type: 'text', channel: 'next_thought', text: 'First public update.' },
    { id: 't1', type: 'tool', tool_id: 'one' },
    { id: 'a1', type: 'text', channel: 'answer', text: 'Intermediate public answer.' },
    { id: 'artifact', type: 'artifact', artifact_id: 'report' },
    { id: 'u2', type: 'text', channel: 'next_thought', text: 'Second public update.' },
    { id: 't2', type: 'tool', tool_id: 'two' },
    { id: 'a2', type: 'text', channel: 'answer', text: 'Final public answer.' },
  ],
};

it('keeps reasoning before its public update when a reconnect has no tool activity', () => {
  const recovered = iteration('reconnected', 0);
  recovered.activity = [];
  recovered.tools = [];
  recovered.thinking[0].text = 'Continuing after reconnect.';
  recovered.nextThoughts = ['The results are saved.'];
  render(<ConversationTurn iterations={[recovered]} mode="chain" subagents={{}} />);
  const thinking = screen.getByRole('button', { name: 'Thinking: Continuing after reconnect.' });
  const update = screen.getByText('The results are saved.');
  expect(thinking.compareDocumentPosition(update) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /^Thinking:/ })).toHaveLength(1);
  expect(screen.queryByRole('group', { name: /^Activity:/ })).not.toBeInTheDocument();
});

it('alternates visible text entries with their own visible activity rows', async () => {
  const view = render(
    <ConversationTurn
      iterations={[iteration('one', 0), iteration('two', 1)]}
      mode="chain"
      subagents={{}}
    />,
  );
  expect(await screen.findByText('Public one update.')).toBeVisible();
  expect(await screen.findByText('Public two update.')).toBeVisible();
  expect(view.container.querySelectorAll('[data-slot="transcript-text-entry"]')).toHaveLength(2);
  // Each settled block between two updates folds into its own row; opening both
  // shows every thought and call in order.
  expect(screen.getAllByRole('group', { name: /^Activity:/ })).toHaveLength(2);
  for (const run of screen.getAllByRole('button', { name: /^Expand Called 1 tool/ }))
    fireEvent.click(run);
  expect(screen.queryByRole('button', { name: /^Activity:/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Reasoning:/ })).not.toBeInTheDocument();
  expect(
    screen
      .getAllByRole('button', { name: /^Thinking:/ })
      .map((button) => button.getAttribute('aria-expanded')),
  ).toEqual(['false', 'false']);
  expect(screen.queryByText('Private recorded one reasoning.')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Technical details for Read file' })).toHaveLength(
    2,
  );
  expect(screen.getByText('one.md')).toBeVisible();
  expect(screen.getByText('two.md')).toBeVisible();
});

it.each(['codex', 'claude_code', 'vllm'])(
  'renders reasoning and public updates by their recorded semantics for %s',
  async (provider) => {
    const recorded: Message = {
      ...message,
      blocks: message.blocks.map((block) =>
        block.type === 'reasoning' ? { ...block, provider_source: provider } : block,
      ),
    };
    const model = conversationTurnPresentation(recorded, { one: call('one'), two: call('two') });
    const first = model.segments[0];
    expect(first.kind).toBe('iterations');
    if (first.kind !== 'iterations') throw new Error('Missing recorded text entry');
    render(<ConversationTurn iterations={first.iterations} mode="chain" subagents={{}} />);
    expect(await screen.findAllByText('First public update.')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Reasoning:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Update:/ })).not.toBeInTheDocument();
    const thinking = screen.getByRole('button', { name: 'Thinking: Recorded reasoning.' });
    const lane = screen.getByRole('group', { name: /^Activity:/ });
    expect(lane).not.toContainElement(thinking);
    fireEvent.click(thinking);
    expect(screen.getByRole('region', { name: 'Thinking details' })).toHaveTextContent(
      'Recorded reasoning.',
    );
  },
);

it('opens streaming thinking and folds it once it completes, unless the reader chose', () => {
  const view = render(
    <ConversationTurn iterations={[iteration('one', 0, true)]} mode="chain" subagents={{}} />,
  );
  expect(screen.getByRole('button', { name: /^Thinking:/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(screen.getByRole('region', { name: 'Thinking details' })).toBeVisible();
  view.rerender(
    <ConversationTurn
      answerStarted
      iterations={[iteration('one', 0)]}
      mode="chain"
      subagents={{}}
    />,
  );
  expect(screen.getByRole('button', { name: /^Thinking:/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

it('folds a finished run into one counted row that opens to its ordered calls', () => {
  const first = iteration('one', 0);
  const second = { ...iteration('two', 1), nextThoughts: [] };
  const view = render(
    <ConversationTurn iterations={[first, second]} mode="chain" subagents={{}} />,
  );
  expect(screen.getAllByRole('group', { name: /^Activity:/ })).toHaveLength(1);
  expect(screen.queryByRole('button', { name: /^Reasoning:/ })).not.toBeInTheDocument();
  expect(screen.getByText('Public one update.')).toBeVisible();
  const timeline = view.container.querySelector('[data-slot="transcript-activity-timeline"]')!;
  const ordered = (root: ParentNode) =>
    Array.from(
      root.querySelectorAll(
        'button[aria-label^="Thinking:"],button[aria-label^="Technical details"]',
      ),
    ).map((node) => node.getAttribute('aria-label') ?? node.textContent);
  // The first thought reads before its public update; the rest of the run folds into one row.
  expect(ordered(timeline)).toEqual([]);
  const run = screen.getByRole('button', { name: 'Expand Called 2 tools, thought once' });
  expect(timeline).toHaveAttribute('data-run-collapsed');
  fireEvent.click(run);
  expect(
    screen.getByRole('button', { name: 'Collapse Called 2 tools, thought once' }),
  ).toHaveAttribute('aria-expanded', 'true');
  expect(ordered(view.container)).toEqual([
    'Thinking: Private recorded one reasoning.',
    'Technical details for Read file',
    'Thinking: Private recorded two reasoning.',
    'Technical details for Read file',
  ]);
  expect(ordered(timeline)).toEqual(ordered(view.container).slice(1));
});

it('keeps a live run as flat rows until it settles', () => {
  const view = render(
    <ConversationTurn
      followLiveActivity
      iterations={[iteration('one', 0), { ...iteration('two', 1, true), nextThoughts: [] }]}
      mode="chain"
      subagents={{}}
    />,
  );
  expect(view.container.querySelector('[data-run-summary]')).toBeNull();
  view.rerender(
    <ConversationTurn
      iterations={[iteration('one', 0), { ...iteration('two', 1), nextThoughts: [] }]}
      mode="chain"
      subagents={{}}
    />,
  );
  expect(
    screen.getByRole('button', { name: 'Expand Called 2 tools, thought once' }),
  ).toBeInTheDocument();
});

it('retains an opened tool result across live updates and answer arrival', async () => {
  const view = render(
    <ConversationTurn iterations={[iteration('one', 0)]} mode="chain" subagents={{}} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Expand Called 1 tool' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show result for Read file' }));
  expect(await screen.findByText('Complete one result.')).toBeVisible();
  view.rerender(
    <ConversationTurn
      answerStarted
      iterations={[iteration('one', 0), iteration('two', 1, true)]}
      mode="chain"
      subagents={{}}
    />,
  );
  expect(screen.getByText('Complete one result.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Collapse Read file' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

it('retains reader choices when a virtualized row unmounts and returns', () => {
  const entry = <ConversationTurn iterations={[iteration('one', 0)]} mode="chain" subagents={{}} />;
  const view = render(<TranscriptDisclosures>{entry}</TranscriptDisclosures>);
  fireEvent.click(screen.getByRole('button', { name: /^Thinking:/ }));
  view.rerender(<TranscriptDisclosures>{null}</TranscriptDisclosures>);
  expect(screen.queryByRole('button', { name: /^Thinking:/ })).not.toBeInTheDocument();
  view.rerender(<TranscriptDisclosures>{entry}</TranscriptDisclosures>);
  expect(screen.getByRole('region', { name: 'Thinking details' })).toHaveTextContent(
    'Private recorded one reasoning.',
  );
  expect(screen.getByRole('button', { name: /^Thinking:/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  view.rerender(<TranscriptDisclosures key="another-conversation">{entry}</TranscriptDisclosures>);
  expect(screen.getByRole('button', { name: /^Thinking:/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

it('opens complete tool arguments and result from the keyboard and restores focus', async () => {
  const user = userEvent.setup();
  render(<ConversationTurn iterations={[iteration('one', 0)]} mode="chain" subagents={{}} />);
  await user.click(screen.getByRole('button', { name: 'Expand Called 1 tool' }));
  const trigger = screen.getByRole('button', { name: 'Technical details for Read file' });
  trigger.focus();
  await user.keyboard('{Enter}');
  expect(
    await screen.findByRole('dialog', { name: 'Read file: Technical details' }),
  ).toHaveTextContent('one.md');
  await waitFor(() => expect(screen.getByText('Complete one result.')).toBeVisible());
  await user.keyboard('{Escape}');
  expect(trigger).toHaveFocus();
  expect(
    screen.queryByRole('dialog', { name: 'Read file: Technical details' }),
  ).not.toBeInTheDocument();
});

it('preserves canonical text and artifact boundaries instead of moving them after tools', () => {
  const model = conversationTurnPresentation(message, { one: call('one'), two: call('two') });
  expect(
    model.segments.map((part) =>
      part.kind === 'iterations'
        ? part.iterations.map((i) => i.tools[0]?.id).join(',')
        : part.kind === 'block'
          ? part.block.id
          : part.message.id,
    ),
  ).toEqual(['one', 'a1', 'artifact', 'two', 'a2']);
});

it('keeps unavailable invocations at their recorded place', () => {
  const model = conversationTurnPresentation(message, { two: call('two') });
  expect(
    model.segments.map((part) =>
      part.kind === 'iterations' ? 'text' : part.kind === 'block' ? part.block.id : part.message.id,
    ),
  ).toEqual(['text', 't1', 'a1', 'artifact', 'text', 'a2']);
  expect(model.residualBlocks.some((block) => block.id === 't1')).toBe(true);
});

it('retains explicit false and zero results in technical details', async () => {
  const view = render(<ClioToolInvocation compact tool={{ ...call('one'), output: false }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Technical details for Read file' }));
  expect(await screen.findByText('false', { exact: true })).toBeVisible();
  view.rerender(<ClioToolInvocation compact tool={{ ...call('one'), output: 0 }} />);
  expect(await screen.findByText('0', { exact: true })).toBeVisible();
});

it('renders the same alternating semantics from a saved assistant message', async () => {
  render(
    <AppearanceProvider>
      <ClioMotionProvider>
        <ConversationDisplayProvider>
          <ClioConversation
            messages={[
              {
                ...message,
                completed_at: '2026-10-08T00:01:00Z',
                stop_reason: 'completed',
                blocks: message.blocks.filter((block) => block.type !== 'artifact'),
              },
            ]}
            tools={{
              one: call('one'),
              two: {
                ...call('two'),
                presentation: { status: 'failed', summary: 'Failed', blocks: [] },
              },
            }}
            tasks={{}}
            subagents={{}}
            artifacts={{}}
            surfaces={{}}
          />
        </ConversationDisplayProvider>
      </ClioMotionProvider>
    </AppearanceProvider>,
  );
  await waitFor(() => expect(screen.getByText('Final public answer.')).toBeVisible());
  const updates = [
    'First public update.',
    'Intermediate public answer.',
    'Second public update.',
    'Final public answer.',
  ].map((text) => screen.getByText(text));
  for (let index = 1; index < updates.length; index++)
    expect(
      updates[index - 1].compareDocumentPosition(updates[index]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  const lanes = screen.getAllByRole('group', { name: /^Activity:/ });
  expect(lanes).toHaveLength(2);
  for (const lane of lanes) expect(lane).toHaveAccessibleName('Activity: Called 1 tool');
  // The folded run counts its failure; opening it shows the failed call's own row.
  expect(lanes[1]).toHaveTextContent('1 failed');
  for (const run of screen.getAllByRole('button', { name: 'Expand Called 1 tool' }))
    fireEvent.click(run);
  expect(screen.getByRole('img', { name: 'Failed: Failed' })).toBeInTheDocument();
});
