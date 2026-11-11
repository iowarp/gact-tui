import type { PendingInteraction } from '@clio/core/v3';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { QuestionResponse } from './pending-interaction-question-response';
import { AttentionDraftContext, createAttentionDraftStore } from './attention-drafts';

afterEach(cleanup);
// The bundle pages its questions in the header; the footer's Next question advances.
const questionPager = () => screen.getByRole('navigation', { name: 'Questions' });
const nextQuestion = () =>
  within(screen.getByRole('group', { name: 'Answers' })).getByRole('button', {
    name: 'Next question',
  });
const bundle: PendingInteraction = {
  id: 'question:presentation',
  kind: 'question',
  status: 'pending',
  owner_session_id: 's',
  attended_session_id: 's',
  title: 'Plan the analysis',
  source: { protocol: 'native' },
  created_at: '2026-10-21T00:00:00Z',
  actions: ['answer', 'cancel'],
  payload: {
    mode: 'form',
    metadata: {
      question_bundle: {
        questions: [
          {
            id: 'view',
            question: 'Which view?',
            allow_freeform: false,
            options: [
              { value: 'table', label: 'Table', description: 'Sortable rows' },
              { value: 'plot', label: 'Plot', description: 'Changes over time' },
            ],
          },
          {
            id: 'scope',
            question: 'Which region?',
            allow_freeform: true,
            options: [{ value: 'alaska', label: 'Alaska' }],
          },
        ],
      },
    },
  },
};

it('keeps bundle answers across paging and a responsive remount, then sends them once', async () => {
  const user = userEvent.setup();
  const onResponse = vi.fn().mockResolvedValue(undefined);
  const drafts = createAttentionDraftStore();
  const content = (key: string) => (
    <AttentionDraftContext.Provider value={drafts}>
      <QuestionResponse key={key} interaction={bundle} showOwner={false} onResponse={onResponse} />
    </AttentionDraftContext.Provider>
  );
  const view = render(content('desktop'));
  expect(questionPager()).toHaveTextContent('1/2');
  expect(screen.getByRole('heading', { name: 'Which view?' })).toBeVisible();
  expect(screen.getByRole('radio', { name: /^Table/ })).toHaveTextContent('Sortable rows');
  await user.click(screen.getByRole('radio', { name: /^Table/ }));
  expect(screen.getByRole('radio', { name: /^Table/ })).toBeChecked();
  await user.click(nextQuestion());
  await user.click(screen.getByRole('radio', { name: 'Other answer' }));
  await user.type(screen.getByRole('textbox', { name: 'Which region?' }), 'California');
  view.rerender(content('phone'));
  expect(questionPager()).toHaveTextContent('2/2');
  expect(screen.getByRole('textbox', { name: 'Which region?' })).toHaveValue('California');
  await user.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('radio', { name: /^Table/ })).toBeChecked();
  await user.click(nextQuestion());
  expect(onResponse).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Submit all answers' }));
  await waitFor(() => expect(onResponse).toHaveBeenCalledOnce());
  expect(onResponse).toHaveBeenCalledWith(bundle, {
    action: 'answer',
    metadata: {
      answers: {
        view: { answer: '', selected_options: ['table'] },
        scope: { answer: 'California', selected_options: [] },
      },
    },
  });
});

it('keeps the write-in answer when visiting an offered choice', async () => {
  const user = userEvent.setup();
  const onResponse = vi.fn();
  render(<QuestionResponse interaction={bundle} showOwner={false} onResponse={onResponse} />);
  await user.click(screen.getByRole('radio', { name: /^Plot/ }));
  await user.click(nextQuestion());
  await user.click(screen.getByRole('radio', { name: 'Other answer' }));
  await user.type(screen.getByRole('textbox'), 'California');
  await user.click(screen.getByRole('radio', { name: 'Alaska' }));
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: 'Other answer' }));
  expect(screen.getByRole('textbox')).toHaveValue('California');
  expect(onResponse).not.toHaveBeenCalled();
});
