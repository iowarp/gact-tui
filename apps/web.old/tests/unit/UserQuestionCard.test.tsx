import { render, screen, fireEvent, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserQuestion } from '@clio/core';
import { UserQuestionCard } from '../../src/components/UserQuestionCard.js';

afterEach(cleanup);

function confirmationQuestion(overrides: Partial<UserQuestion> = {}): UserQuestion {
  return {
    id: 'q-confirm',
    session_id: 's1',
    prompt: 'Apply the migration to production?',
    status: 'pending',
    kind: 'confirmation',
    created_at: '2026-06-23T00:00:00Z',
    updated_at: '2026-06-23T00:00:00Z',
    ...overrides,
  } as UserQuestion;
}

/**
 * e2e-style render test for the confirmation (yes/no) flow, complementing the
 * pure-model coverage in UserQuestionCardModel.test.ts. Proves the card renders
 * its prompt and the Yes/No choices, and that clicking a choice drives the
 * answer action with the expected `{ answer }` body.
 */
describe('UserQuestionCard confirmation flow', () => {
  it('renders the prompt and the yes/no choices', () => {
    render(() => (
      <UserQuestionCard
        question={confirmationQuestion()}
        onAnswer={() => {}}
        onCancel={() => {}}
      />
    ));

    expect(screen.getByTestId('user-question-q-confirm')).toBeTruthy();
    expect(screen.getByText('Apply the migration to production?')).toBeTruthy();
    expect(screen.getByTestId('user-question-yes')).toBeTruthy();
    expect(screen.getByTestId('user-question-no')).toBeTruthy();
  });

  it('answers "yes" with the confirmation body when the Yes choice is clicked', () => {
    const onAnswer = vi.fn();
    render(() => (
      <UserQuestionCard
        question={confirmationQuestion()}
        onAnswer={onAnswer}
        onCancel={() => {}}
      />
    ));

    fireEvent.click(screen.getByTestId('user-question-yes'));

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ answer: 'yes' });
  });

  it('answers "no" with the confirmation body when the No choice is clicked', () => {
    const onAnswer = vi.fn();
    render(() => (
      <UserQuestionCard
        question={confirmationQuestion()}
        onAnswer={onAnswer}
        onCancel={() => {}}
      />
    ));

    fireEvent.click(screen.getByTestId('user-question-no'));

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({ answer: 'no' });
  });

  it('does not render choice/freeform bodies for a confirmation question', () => {
    render(() => (
      <UserQuestionCard
        question={confirmationQuestion()}
        onAnswer={() => {}}
        onCancel={() => {}}
      />
    ));

    // No freeform Send button and no choice radio list should be present.
    expect(screen.queryByTestId('user-question-send')).toBeNull();
  });

  it('cancels the turn via the dismiss control', () => {
    const onCancel = vi.fn();
    render(() => (
      <UserQuestionCard
        question={confirmationQuestion()}
        onAnswer={() => {}}
        onCancel={onCancel}
      />
    ));

    fireEvent.click(screen.getByLabelText('Cancel question'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
