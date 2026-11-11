import type { PendingInteraction } from '@clio/core/v3';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ClioPendingInteractions } from './pending-interactions';
import { ATTENTION_REVEAL_EVENT } from './interaction-control';
import { AttentionDraftContext, createAttentionDraftStore } from './attention-drafts';

afterEach(cleanup);
// Every card carries the pager in its header; only the shown card's is accessible.
const pager = () => screen.getByRole('navigation', { name: 'Pending requests' });
// A bundle pages its own questions in the header; the footer's Next question advances.
const questionPager = () => screen.getByRole('navigation', { name: 'Questions' });
const nextQuestion = () =>
  within(screen.getByRole('group', { name: 'Answers' })).getByRole('button', {
    name: 'Next question',
  });
const question = (id: string): PendingInteraction => ({
  id,
  kind: 'question',
  status: 'pending',
  owner_session_id: 's',
  attended_session_id: 's',
  title: 'Question from agent',
  prompt: `Question ${id}?`,
  source: { protocol: 'native' },
  created_at: '2026-10-16T12:00:00Z',
  actions: ['answer', 'cancel'],
});
const bundle: PendingInteraction = {
  ...question('bundle'),
  prompt: 'Choose the analysis',
  payload: {
    metadata: {
      question_bundle: {
        questions: [
          {
            id: 'view',
            question: 'Which view?',
            kind: 'choice',
            options: [
              { label: 'Table', value: 'table' },
              { label: 'Plot', value: 'plot' },
            ],
          },
          {
            id: 'region',
            question: 'Which region?',
            kind: 'choice',
            allow_freeform: true,
            options: [{ label: 'Europe', value: 'eu' }],
          },
          {
            id: 'notes',
            question: 'What should I emphasize?',
            kind: 'freeform',
            allow_freeform: true,
            options: [],
          },
        ],
      },
    },
  },
};

it('treats a question id matching an Object property as an unanswered field', async () => {
  const onResponse = vi.fn();
  const interaction: PendingInteraction = {
    ...question('prototype-name'),
    payload: {
      metadata: {
        question_bundle: {
          questions: [
            {
              id: 'constructor',
              question: 'Which constructor?',
              kind: 'freeform',
              allow_freeform: true,
              options: [],
            },
          ],
        },
      },
    },
  };
  render(
    <ClioPendingInteractions
      interactions={[interaction]}
      viewedSessionId="s"
      onResponse={onResponse}
    />,
  );
  expect(screen.getByRole('button', { name: 'Submit all answers' })).toBeDisabled();
  await userEvent.type(screen.getByRole('textbox'), 'Default');
  await userEvent.click(screen.getByRole('button', { name: 'Submit all answers' }));
  expect(onResponse).toHaveBeenCalledWith(interaction, {
    action: 'answer',
    metadata: { answers: { constructor: { answer: 'Default', selected_options: [] } } },
  });
});

it('retains bundle page and answers when the responsive composer remounts', async () => {
  const user = userEvent.setup();
  const drafts = createAttentionDraftStore();
  const renderPanel = (key: string) => (
    <AttentionDraftContext.Provider value={drafts}>
      <ClioPendingInteractions
        key={key}
        viewedSessionId="s"
        interactions={[bundle]}
        onResponse={vi.fn()}
      />
    </AttentionDraftContext.Provider>
  );
  const { rerender } = render(renderPanel('desktop'));
  await user.click(screen.getByRole('radio', { name: 'Table' }));
  await user.click(nextQuestion());
  await user.click(screen.getByRole('radio', { name: 'Other answer' }));
  await user.type(screen.getByRole('textbox'), 'New Zealand');
  await user.click(nextQuestion());
  rerender(renderPanel('phone'));
  expect(questionPager()).toHaveTextContent('3/3');
  await user.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('textbox')).toHaveValue('New Zealand');
  await user.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('radio', { name: 'Table' })).toBeChecked();
}, 20_000);

it('shows one request, preserves drafts on navigation, and moves to the next surviving request', async () => {
  const user = userEvent.setup();
  const first = question('first'),
    second = question('second'),
    third = question('third');
  const props = { viewedSessionId: 's', onResponse: vi.fn(async () => undefined) };
  const { rerender } = render(
    <ClioPendingInteractions {...props} interactions={[first, second, third]} />,
  );
  expect(pager()).toHaveTextContent('1/3');
  expect(screen.getAllByRole('textbox')).toHaveLength(1);
  await user.type(screen.getByRole('textbox'), 'Keep my draft');
  await user.click(screen.getByRole('button', { name: 'Next request' }));
  expect(pager()).toHaveTextContent('2/3');
  await user.type(screen.getByRole('textbox'), 'Second draft');
  await user.click(screen.getByRole('button', { name: 'Previous request' }));
  expect(screen.getByRole('textbox')).toHaveValue('Keep my draft');
  expect(screen.getByRole('textbox')).toHaveValue('Keep my draft');
  await user.click(screen.getByRole('button', { name: 'Send response' }));
  rerender(<ClioPendingInteractions {...props} interactions={[second, third]} />);
  expect(pager()).toHaveTextContent('1/2');
  expect(screen.getByRole('textbox')).toHaveValue('Second draft');
  rerender(<ClioPendingInteractions {...props} interactions={[second]} />);
  expect(screen.queryByRole('navigation', { name: 'Pending requests' })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('Second draft');
});

it('reveals the requested hidden page without losing other drafts', async () => {
  const user = userEvent.setup();
  render(
    <ClioPendingInteractions
      viewedSessionId="s"
      interactions={[question('first'), question('second')]}
      onResponse={vi.fn()}
    />,
  );
  await user.type(screen.getByRole('textbox'), 'First draft');
  act(() => window.dispatchEvent(new CustomEvent(ATTENTION_REVEAL_EVENT, { detail: 'second' })));
  expect(pager()).toHaveTextContent('2/2');
  expect(screen.getByText('Question second?')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Previous request' }));
  expect(screen.getByRole('textbox')).toHaveValue('First draft');
});

it('submits three answers together, preserves drafts across requests, and retains answers on retry', async () => {
  const user = userEvent.setup();
  const onResponse = vi
    .fn()
    .mockRejectedValueOnce(new Error('Try again'))
    .mockResolvedValue(undefined);
  render(
    <ClioPendingInteractions
      viewedSessionId="s"
      interactions={[bundle, question('other')]}
      onResponse={onResponse}
    />,
  );
  await user.click(screen.getByRole('radio', { name: 'Table' }));
  await user.click(nextQuestion());
  await user.click(screen.getByRole('radio', { name: 'Other answer' }));
  await user.type(screen.getByRole('textbox', { name: 'Which region?' }), 'New Zealand');
  await user.click(screen.getByRole('button', { name: 'Next request' }));
  await user.click(screen.getByRole('button', { name: 'Previous request' }));
  expect(screen.getByRole('textbox', { name: 'Which region?' })).toHaveValue('New Zealand');
  await user.click(nextQuestion());
  expect(screen.getByRole('button', { name: 'Submit all answers' })).toBeDisabled();
  expect(onResponse).not.toHaveBeenCalled();
  await user.type(screen.getByRole('textbox', { name: 'What should I emphasize?' }), 'Uncertainty');
  await user.click(screen.getByRole('button', { name: 'Submit all answers' }));
  expect(await screen.findByText('Try again')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Back' }));
  await user.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('radio', { name: 'Table' })).toBeChecked();
  await user.click(nextQuestion());
  await user.click(nextQuestion());
  expect(screen.getByRole('textbox')).toHaveValue('Uncertainty');
  await user.click(screen.getByRole('button', { name: 'Submit all answers' }));
  await waitFor(() => expect(onResponse).toHaveBeenCalledTimes(2));
  const response = {
    action: 'answer',
    metadata: {
      answers: {
        view: { answer: '', selected_options: ['table'] },
        region: { answer: 'New Zealand', selected_options: [] },
        notes: { answer: 'Uncertainty', selected_options: [] },
      },
    },
  };
  expect(onResponse).toHaveBeenNthCalledWith(1, bundle, response);
  expect(onResponse).toHaveBeenNthCalledWith(2, bundle, response);
}, 20_000);
