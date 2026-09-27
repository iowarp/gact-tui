import type { PendingInteraction } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InlineQuestionCard } from './inline-question-card';
import { QuestionAnswerContext, type QuestionAnswerState } from './question-answer-context';

afterEach(cleanup);

const LONG_PROMPT =
  'Before I submit a real sbatch job to build the geometry and capture the snapshot, ' +
  'I need you to confirm the Slurm resources to charge. 1) Account: your associations ' +
  'include hochhalter (several QOS variants), notchpeak-shared-short and owner-guest.';

function question(overrides: Partial<PendingInteraction> = {}): PendingInteraction {
  return {
    id: 'question:q1',
    kind: 'question',
    status: 'pending',
    session_id: 'session_1',
    owner_session_id: 'session_1',
    attended_session_id: 'session_1',
    title: 'Question',
    prompt: LONG_PROMPT,
    created_at: '2026-09-26T10:00:00Z',
    actions: ['answer', 'cancel'],
    source: { protocol: 'native', tool_name: 'ask_user', invocation_id: 'call_1' },
    payload: {
      question_kind: 'choice',
      allow_freeform: true,
      options: [
        { label: 'Normal', value: 'normal' },
        { label: 'Preempt', value: 'preempt' },
      ],
    },
    ...overrides,
  } as PendingInteraction;
}

function renderCard(
  interaction: PendingInteraction,
  onResponse = vi.fn().mockResolvedValue(undefined),
  answer: Partial<QuestionAnswerState> = {},
) {
  const state: QuestionAnswerState = {
    startAnswer: vi.fn(),
    stopAnswer: vi.fn(),
    ...answer,
  };
  render(
    <QuestionAnswerContext.Provider value={state}>
      <InlineQuestionCard interaction={interaction} onResponse={onResponse} />
    </QuestionAnswerContext.Provider>,
  );
  return { onResponse, state };
}

describe('InlineQuestionCard', () => {
  it('shows the whole question, never clamped, inside a bounded scroll area', () => {
    renderCard(question());

    const prompt = screen
      .getByText(/confirm the Slurm resources/)
      .closest('[data-slot="inline-question-prompt"]');
    expect(prompt).not.toBeNull();
    expect(prompt?.className).toContain('max-h-72');
    expect(prompt?.className).toContain('overflow-y-auto');
    expect(prompt?.className).not.toContain('line-clamp');
    expect(screen.getByText(/owner-guest/)).toBeInTheDocument();
  });

  it('answers at once when an option is picked', async () => {
    const user = userEvent.setup();
    const { onResponse } = renderCard(question());

    await user.click(screen.getByRole('button', { name: 'Preempt' }));

    expect(onResponse).toHaveBeenCalledWith(expect.objectContaining({ id: 'question:q1' }), {
      action: 'answer',
      selected_options: ['preempt'],
    });
  });

  it('hands an "Other answer" to the main composer', async () => {
    const user = userEvent.setup();
    const { state, onResponse } = renderCard(question());

    await user.click(screen.getByRole('button', { name: 'Other answer' }));

    expect(state.startAnswer).toHaveBeenCalledWith('question:q1');
    expect(onResponse).not.toHaveBeenCalled();
  });

  it('says where to type once the composer is answering it', () => {
    renderCard(question(), undefined, { answeringId: 'question:q1' });

    expect(screen.getByText('Type your answer in the message box below.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Other answer' })).not.toBeInTheDocument();
  });

  it('offers only the composer for a free-text question', () => {
    renderCard(question({ payload: { question_kind: 'freeform' } }));

    expect(screen.getByRole('button', { name: 'Answer' })).toBeInTheDocument();
  });

  it('sends every picked option of a multi-choice question together', async () => {
    const user = userEvent.setup();
    const { onResponse } = renderCard(
      question({
        payload: {
          question_kind: 'multi_choice',
          options: [
            { label: 'Stress', value: 'stress' },
            { label: 'Strain', value: 'strain' },
          ],
        },
      }),
    );

    await user.click(screen.getByLabelText('Stress'));
    await user.click(screen.getByLabelText('Strain'));
    await user.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(onResponse).toHaveBeenCalledWith(expect.anything(), {
      action: 'answer',
      selected_options: ['stress', 'strain'],
    });
  });

  it('keeps a failed answer on the card', async () => {
    const user = userEvent.setup();
    renderCard(question(), vi.fn().mockRejectedValue(new Error('interaction is already resolved')));

    await user.click(screen.getByRole('button', { name: 'Normal' }));

    expect(await screen.findByText('interaction is already resolved')).toBeInTheDocument();
  });
});
