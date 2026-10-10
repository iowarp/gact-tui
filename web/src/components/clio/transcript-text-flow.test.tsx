import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { transcriptContentSelection } from '@/lib/transcript-content-selection';
import '@/components/ai-elements/markdown';
import { ConversationTurn } from './conversation-turn';
import { ConversationProcessSequence } from './conversation-process-sequence';
import type { ConversationIteration } from './conversation-turn-model';
import { TranscriptReasoningPassage } from './transcript-reasoning-passage';

afterEach(cleanup);

const reasoning =
  '**Diagnosing shell issues**\n\nI need to check the environment settings before creating the model.';
const update = 'I’ll make a toy-like 3D version, keeping the striped tail and pink heart.';
const iteration: ConversationIteration = {
  id: 'diagnosis',
  index: 0,
  agentId: 'main',
  thinking: [
    {
      id: 'reasoning',
      text: reasoning,
      label: 'Thinking',
      streaming: false,
      source: { messageId: 'm', sessionId: 's', partId: 'reasoning', field: 'text' },
    },
  ],
  nextThoughts: [update],
  activity: [],
  tools: [],
  tasks: [],
  terminal: false,
  interrupted: false,
  streaming: false,
  summary: 'Diagnosing shell issues',
};

it.each(['chain', 'full'] as const)(
  'opens complete thinking on click while public prose remains visible in %s mode',
  async (mode) => {
    const view = render(<ConversationTurn iterations={[iteration]} mode={mode} subagents={{}} />);
    const trigger = screen.getByRole('button', { name: /^Thinking:/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(within(trigger).getByText('Diagnosing shell issues')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Thinking details' })).not.toBeInTheDocument();
    expect(await screen.findByText(update)).toBeVisible();
    fireEvent.click(trigger);
    const passage = screen.getByRole('region', { name: 'Thinking details' });
    expect(within(trigger).getByText('Diagnosing shell issues')).toBeVisible();
    expect(
      await within(passage).findByText(/I need to check the environment settings/),
    ).toBeVisible();
    expect(within(passage).queryByText('Diagnosing shell issues')).not.toBeInTheDocument();
    const publicText = await screen.findByText(update);
    expect(publicText).toBeVisible();
    expect(passage).not.toContainElement(publicText);
    expect(view.container.querySelector('[data-part-id="reasoning"]')).toHaveAttribute(
      'data-content-revision',
      createHash('sha256').update(reasoning).digest('hex'),
    );
    expect(view.container.querySelector('[data-part-id="reasoning"]')).toHaveAttribute(
      'data-field',
      'text',
    );
    fireEvent.click(trigger);
    expect(screen.queryByRole('region', { name: 'Thinking details' })).not.toBeInTheDocument();
    expect(publicText).toBeVisible();
  },
);

it('keeps reasoning inside its reader-controlled activity and public text outside it', async () => {
  const tool = {
    id: 'run',
    session_id: 's',
    name: 'shell_bash',
    title: 'Run',
    state: 'failed' as const,
    input: { command: 'Get-Location' },
    error: 'Historical sandbox launch failure.',
  };
  render(
    <ConversationTurn
      iterations={[
        { ...iteration, tools: [tool], activity: [{ kind: 'tool', id: tool.id, tool }] },
      ]}
      mode="chain"
      subagents={{}}
    />,
  );
  expect(await screen.findByText(update)).toBeVisible();
  expect(screen.queryByRole('button', { name: /^Thinking:/ })).not.toBeInTheDocument();
  const disclosure = screen.getByRole('button', { name: 'Activity: Ran commands' });
  fireEvent.click(disclosure);
  expect(screen.getByRole('button', { name: /^Thinking:/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  fireEvent.click(screen.getByRole('button', { name: /^Thinking:/ }));
  const passage = screen.getByRole('region', { name: 'Thinking details' });
  expect(
    await within(passage).findByText(/I need to check the environment settings/),
  ).toBeVisible();
  expect(
    within(screen.getByRole('button', { name: /^Thinking:/ })).getByText('Diagnosing shell issues'),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Show result for Run' })).toBeVisible();
  expect(passage).not.toContainElement(screen.getByText(update));
  fireEvent.click(disclosure);
  expect(screen.queryByRole('region', { name: 'Thinking details' })).not.toBeInTheDocument();
  expect(screen.getByText(update)).toBeVisible();
});

it('preserves the same full passage and source identity as streaming completes', async () => {
  const streaming = { ...iteration, thinking: [{ ...iteration.thinking[0], streaming: true }] };
  const view = render(<ConversationTurn iterations={[streaming]} mode="full" subagents={{}} />);
  expect(view.container.querySelector('[data-slot="transcript-reasoning"]')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  const trigger = screen.getByRole('button', { name: /^Thinking:/ });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);
  view.rerender(<ConversationTurn iterations={[iteration]} mode="full" subagents={{}} />);
  const passage = screen.getByRole('region', { name: 'Thinking details' });
  expect(view.container.querySelector('[data-slot="transcript-reasoning"]')).not.toHaveAttribute(
    'aria-busy',
  );
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(within(trigger).getByText('Diagnosing shell issues')).toBeVisible();
  expect(
    await within(passage).findByText(/I need to check the environment settings/),
  ).toBeVisible();
  expect(within(passage).queryByText('Diagnosing shell issues')).not.toBeInTheDocument();
  expect(passage.querySelector('[data-part-id="reasoning"]')).toHaveAttribute(
    'data-message-id',
    'm',
  );
});

it('uses the same complete reasoning passage for residual message blocks', async () => {
  render(
    <ConversationProcessSequence
      block={{ id: 'residual', type: 'reasoning', text: reasoning }}
      messageId="m"
      messageSessionId="s"
      tools={{}}
      tasks={{}}
      subagents={{}}
    />,
  );
  const trigger = screen.getByRole('button', { name: /^Thinking:/ });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);
  const passage = screen.getByRole('region', { name: 'Thinking details' });
  expect(within(trigger).getByText('Diagnosing shell issues')).toBeVisible();
  expect(
    await within(passage).findByText(/I need to check the environment settings/),
  ).toBeVisible();
  expect(within(passage).queryByText('Diagnosing shell issues')).not.toBeInTheDocument();
  expect(passage.querySelector('[data-part-id="residual"]')).toHaveAttribute(
    'data-message-id',
    'm',
  );
});

it('retains an unheaded first paragraph in the expanded body', async () => {
  const text = 'I need to check the environment settings.\n\nThen I can create the model.';
  render(<TranscriptReasoningPassage text={text} />);
  const trigger = screen.getByRole('button', { name: /^Thinking:/ });
  fireEvent.click(trigger);
  const body = screen.getByRole('region', { name: 'Thinking details' });
  expect(await within(body).findByText('I need to check the environment settings.')).toBeVisible();
  expect(within(body).getByText('Then I can create the model.')).toBeVisible();
});

it('selects the displayed body using complete recorded source coordinates', async () => {
  render(<TranscriptReasoningPassage text={reasoning} source={iteration.thinking[0].source} />);
  fireEvent.click(screen.getByRole('button', { name: /^Thinking:/ }));
  const paragraph = await screen.findByText(/I need to check the environment settings/);
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  const content = transcriptContentSelection(selection);
  expect(content?.content_revision).toBe(createHash('sha256').update(reasoning).digest('hex'));
  expect(content?.selection).toEqual({
    kind: 'text',
    start: reasoning.indexOf('I need'),
    end: reasoning.length,
  });
  selection.removeAllRanges();
});

it('renders a residual tool thought as public prose with its original field identity', async () => {
  const view = render(
    <ConversationProcessSequence
      block={{ id: 'call-block', type: 'tool', tool_id: 'run', thought: update }}
      messageId="m"
      messageSessionId="s"
      tools={{ run: { id: 'run', session_id: 's', name: 'shell_bash', state: 'succeeded' } }}
      tasks={{}}
      subagents={{}}
    />,
  );
  expect(await screen.findByText(update)).toBeVisible();
  expect(screen.queryByRole('complementary', { name: 'Reasoning' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Thinking/ })).not.toBeInTheDocument();
  expect(view.container.querySelector('[data-part-id="call-block"]')).toHaveAttribute(
    'data-field',
    'thought',
  );
});
