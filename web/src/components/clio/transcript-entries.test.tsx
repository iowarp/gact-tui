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
        text: `Private recorded ${id} reasoning.`,
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

it('alternates visible text entries and independently collapsed tool groups', async () => {
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
  expect(
    screen
      .getAllByRole('button', { name: /^Activity:/ })
      .map((b) => b.getAttribute('aria-expanded')),
  ).toEqual(['false', 'false']);
  expect(screen.queryByRole('button', { name: /^Reasoning:/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: /^Activity:/ })[0]);
  expect(await screen.findByText('Private recorded one reasoning.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Technical details for Read one' })).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Technical details for Read two' }),
  ).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /^Activity:/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Thinking:/ }));
    expect(screen.queryByRole('button', { name: /^Update:/ })).not.toBeInTheDocument();
    expect(
      await screen.findByText('Recorded reasoning.', { exact: true, selector: 'p' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /^Activity:/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  },
);

it('leaves streaming thinking collapsed and retains the reader choice after completion', () => {
  const view = render(
    <ConversationTurn iterations={[iteration('one', 0, true)]} mode="chain" subagents={{}} />,
  );
  fireEvent.click(screen.getByRole('button', { name: /^Activity:/ }));
  expect(screen.getByText('Private recorded one reasoning.')).toBeVisible();
  view.rerender(
    <ConversationTurn
      answerStarted
      iterations={[iteration('one', 0)]}
      mode="chain"
      subagents={{}}
    />,
  );
  expect(screen.getByRole('button', { name: /^Activity:/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(screen.getByRole('button', { name: /^Thinking:/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

it('keeps reasoning-only continuations and their tools in one ordered activity block', () => {
  const first = iteration('one', 0);
  const second = { ...iteration('two', 1), nextThoughts: [] };
  const view = render(
    <ConversationTurn iterations={[first, second]} mode="chain" subagents={{}} />,
  );
  expect(screen.getAllByRole('button', { name: /^Activity:/ })).toHaveLength(1);
  expect(screen.queryByRole('button', { name: /^Reasoning:/ })).not.toBeInTheDocument();
  expect(screen.getByText('Public one update.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /^Activity:/ }));
  const timeline = view.container.querySelector('[data-slot="transcript-activity-timeline"]')!;
  const ordered = Array.from(
    timeline.querySelectorAll(
      'button[aria-label^="Thinking:"],button[aria-label^="Technical details"]',
    ),
  ).map((node) => node.getAttribute('aria-label') ?? node.textContent);
  expect(ordered).toEqual([
    'Thinking: Private recorded one reasoning.',
    'Technical details for Read one',
    'Thinking: Private recorded two reasoning.',
    'Technical details for Read two',
  ]);
});

it('retains an opened tool group across live updates and answer arrival', () => {
  const view = render(
    <ConversationTurn iterations={[iteration('one', 0, true)]} mode="chain" subagents={{}} />,
  );
  fireEvent.click(screen.getByRole('button', { name: /^Activity:/ }));
  view.rerender(
    <ConversationTurn
      answerStarted
      iterations={[iteration('one', 0)]}
      mode="chain"
      subagents={{}}
    />,
  );
  expect(screen.getByRole('button', { name: /^Activity:/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

it('retains reader choices when a virtualized row unmounts and returns', () => {
  const entry = <ConversationTurn iterations={[iteration('one', 0)]} mode="chain" subagents={{}} />;
  const view = render(<TranscriptDisclosures>{entry}</TranscriptDisclosures>);
  fireEvent.click(screen.getByRole('button', { name: /^Activity:/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Thinking:/ }));
  view.rerender(<TranscriptDisclosures>{null}</TranscriptDisclosures>);
  expect(screen.queryByRole('button', { name: /^Activity:/ })).not.toBeInTheDocument();
  view.rerender(<TranscriptDisclosures>{entry}</TranscriptDisclosures>);
  expect(screen.getByRole('button', { name: /^Activity:/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(screen.getByRole('region', { name: 'Thinking details' })).toHaveTextContent(
    'Private recorded one reasoning.',
  );
  expect(screen.getByRole('button', { name: /^Thinking:/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  view.rerender(<TranscriptDisclosures key="another-conversation">{entry}</TranscriptDisclosures>);
  expect(screen.getByRole('button', { name: /^Activity:/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

it('opens complete tool arguments and result from the keyboard and restores focus', async () => {
  const user = userEvent.setup();
  render(<ConversationTurn iterations={[iteration('one', 0)]} mode="chain" subagents={{}} />);
  await user.click(screen.getByRole('button', { name: /^Activity:/ }));
  const trigger = screen.getByRole('button', { name: 'Technical details for Read one' });
  trigger.focus();
  await user.keyboard('{Enter}');
  expect(
    await screen.findByRole('dialog', { name: 'Read one: Technical details' }),
  ).toHaveTextContent('one.md');
  await waitFor(() => expect(screen.getByText('Complete one result.')).toBeVisible());
  await user.keyboard('{Escape}');
  expect(trigger).toHaveFocus();
  expect(
    screen.queryByRole('dialog', { name: 'Read one: Technical details' }),
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
  fireEvent.click(screen.getByRole('button', { name: 'Technical details for Read one' }));
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
  expect(screen.getAllByRole('button', { name: /^Activity:/ })).toHaveLength(2);
  expect(screen.getByText('2 (1 failed) tool calls')).toBeVisible();
  for (const trigger of screen.getAllByRole('button', { name: /^Activity:/ })) {
    expect(trigger).toHaveTextContent('Read files');
    expect(trigger).not.toHaveTextContent(/completed|failed|\d|·/u);
  }
});
