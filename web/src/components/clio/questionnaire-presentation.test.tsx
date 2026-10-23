import type { PendingInteraction } from '@clio/core/v3';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { QuestionResponse } from './pending-interaction-question-response';
import { AttentionDraftContext, createAttentionDraftStore } from './attention-drafts';

afterEach(cleanup);
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

it('preserves per-choice details across selections, bundle navigation and a responsive remount', async () => {
  const user = userEvent.setup();
  const onResponse = vi.fn().mockResolvedValue(undefined);
  const drafts = createAttentionDraftStore();
  const content = (key: string) => (
    <AttentionDraftContext.Provider value={drafts}>
      <QuestionResponse key={key} interaction={bundle} showOwner={false} onResponse={onResponse} />
    </AttentionDraftContext.Provider>
  );
  const view = render(content('desktop'));
  expect(screen.getByRole('status')).toHaveTextContent('Question 1 of 2');
  expect(screen.getByRole('button', { name: 'Add comment on Table' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Add comment on Table' }));
  expect(screen.getByRole('radio', { name: 'Table' })).toBeChecked();
  await user.type(
    screen.getByRole('textbox', { name: 'Comment on Table' }),
    'Keep revision timestamps',
  );
  await user.click(screen.getByRole('button', { name: 'Add comment on Plot' }));
  await user.type(screen.getByRole('textbox', { name: 'Comment on Plot' }), 'Use UTC');
  await user.click(screen.getByRole('radio', { name: 'Table' }));
  expect(screen.getByRole('textbox', { name: 'Comment on Table' })).toHaveValue(
    'Keep revision timestamps',
  );
  await user.click(screen.getByRole('button', { name: 'Next question' }));
  await user.click(screen.getByRole('radio', { name: 'Other answer' }));
  await user.type(screen.getByRole('textbox', { name: 'Which region?' }), 'California');
  view.rerender(content('phone'));
  expect(screen.getByRole('status')).toHaveTextContent('Question 2 of 2');
  expect(screen.getByRole('textbox', { name: 'Which region?' })).toHaveValue('California');
  await user.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('textbox', { name: 'Comment on Table' })).toHaveValue(
    'Keep revision timestamps',
  );
  await user.click(screen.getByRole('button', { name: 'Next question' }));
  expect(onResponse).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Submit all answers' }));
  await waitFor(() => expect(onResponse).toHaveBeenCalledOnce());
  expect(onResponse).toHaveBeenCalledWith(bundle, {
    action: 'answer',
    metadata: {
      answers: {
        view: { answer: 'Keep revision timestamps', selected_options: ['table'] },
        scope: { answer: 'California', selected_options: [] },
      },
    },
  });
});

it('keeps the write-in answer when visiting an offered choice and does not submit on pencil clicks', async () => {
  const user = userEvent.setup();
  const onResponse = vi.fn();
  render(<QuestionResponse interaction={bundle} showOwner={false} onResponse={onResponse} />);
  await user.click(screen.getByRole('radio', { name: 'Plot' }));
  await user.click(screen.getByRole('button', { name: 'Next question' }));
  await user.click(screen.getByRole('radio', { name: 'Other answer' }));
  await user.type(screen.getByRole('textbox'), 'California');
  await user.click(screen.getByRole('button', { name: 'Add comment on Alaska' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Comment on Alaska' }),
    'Exclude offshore events',
  );
  await user.click(screen.getByRole('radio', { name: 'Other answer' }));
  expect(screen.getByRole('textbox')).toHaveValue('California');
  expect(onResponse).not.toHaveBeenCalled();
});
