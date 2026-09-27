import type { PendingInteraction } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PendingQuestionNotice } from './pending-question-notice';

afterEach(cleanup);

function question(id: string, prompt: string): PendingInteraction {
  return {
    id,
    kind: 'question',
    status: 'pending',
    owner_session_id: 's',
    attended_session_id: 's',
    title: 'Question',
    prompt,
    created_at: '2026-09-26T10:00:00Z',
    source: { protocol: 'native', tool_name: 'ask_user', invocation_id: `call_${id}` },
  } as PendingInteraction;
}

describe('PendingQuestionNotice', () => {
  it('counts the waiting questions and goes to the oldest', async () => {
    const user = userEvent.setup();
    const onGoToQuestion = vi.fn();
    const first = question('q1', 'Which account?');
    render(
      <PendingQuestionNotice
        onGoToQuestion={onGoToQuestion}
        onStopAnswering={vi.fn()}
        questions={[first, question('q2', 'Which directory?')]}
      />,
    );

    expect(screen.getByText('The agent asked you 2 questions')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go to question' }));
    expect(onGoToQuestion).toHaveBeenCalledWith(first);
  });

  it('names the question the next message answers and can stop', async () => {
    const user = userEvent.setup();
    const onStopAnswering = vi.fn();
    const target = question('q2', 'Which directory?');
    render(
      <PendingQuestionNotice
        answering={target}
        onGoToQuestion={vi.fn()}
        onStopAnswering={onStopAnswering}
        questions={[question('q1', 'Which account?'), target]}
      />,
    );

    expect(screen.getByText('Which directory?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop answering' }));
    expect(onStopAnswering).toHaveBeenCalled();
  });

  it('renders nothing when no question is waiting', () => {
    const { container } = render(
      <PendingQuestionNotice onGoToQuestion={vi.fn()} onStopAnswering={vi.fn()} questions={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
