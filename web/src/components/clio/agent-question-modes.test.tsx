import type { PendingInteraction } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { responseTrayInteractions } from './workspace-route-state';
import { OpenQuestionsTracker } from './open-questions-tracker';
import { InlineQuestionCard } from './inline-question-card';
import { AgentQuestionDialog } from './agent-question-dialog';
import { QuestionAnswerContext } from './question-answer-context';
import { vocab } from '@/lib/brand-vocabulary';

afterEach(cleanup);
function question(mode: 'async' | 'blocking'): PendingInteraction {
  return {
    id: `question:${mode}`,
    kind: 'question',
    status: 'pending',
    owner_session_id: 's',
    attended_session_id: 's',
    title: 'Question from agent',
    prompt: 'What does X mean?',
    created_at: '2026-10-08T00:00:00Z',
    source: { protocol: 'native', tool_name: 'ask_user', invocation_id: 'tool1' },
    payload: { response_mode: mode, question_id: mode, question_kind: 'freeform' },
    actions: ['answer', 'cancel'],
  };
}
describe('explicit agent question modes', () => {
  it('puts blocking questions in the tray even with a transcript anchor, and keeps async out', () => {
    const rows = [question('async'), question('blocking')];
    expect(responseTrayInteractions(rows, new Set(['tool1']))).toEqual([rows[1]]);
  });
  it('opens an async question from a compact transcript entry without answering it', async () => {
    const openQuestion = vi.fn();
    const onResponse = vi.fn();
    render(
      <QuestionAnswerContext.Provider
        value={{ openQuestion, startAnswer: vi.fn(), stopAnswer: vi.fn() }}
      >
        <InlineQuestionCard interaction={question('async')} onResponse={onResponse} />
      </QuestionAnswerContext.Provider>,
    );
    expect(screen.getByText(/Answer when ready/)).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(`${vocab.agent} asked a question`) }),
    );
    expect(openQuestion).toHaveBeenCalledWith(question('async'));
    expect(onResponse).not.toHaveBeenCalled();
  });
  it('tracks both modes at the lower right, excluding resolved questions', async () => {
    const openQuestion = vi.fn();
    render(
      <QuestionAnswerContext.Provider
        value={{ openQuestion, startAnswer: vi.fn(), stopAnswer: vi.fn() }}
      >
        <OpenQuestionsTracker
          bottomInset={80}
          interactions={[
            question('async'),
            question('blocking'),
            { ...question('async'), id: 'done', status: 'answered' },
          ]}
        />
      </QuestionAnswerContext.Provider>,
    );
    expect(screen.getByRole('complementary')).toHaveStyle({ bottom: '92px' });
    await userEvent.click(screen.getByRole('button', { name: '2 open questions' }));
    await userEvent.click(screen.getByRole('button', { name: /Answer when ready/ }));
    expect(openQuestion).toHaveBeenCalledWith(question('async'));
  });
  it('uses a centered transcript-width dialog and sends a free-text answer', async () => {
    const respond = vi.fn().mockResolvedValue(undefined);
    render(
      <AgentQuestionDialog
        interaction={question('async')}
        onClose={vi.fn()}
        onResponse={respond}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveClass('top-1/2', '-translate-y-1/2', 'sm:max-w-4xl');
    await userEvent.type(screen.getByRole('textbox'), 'Stiffness');
    await userEvent.click(screen.getByRole('button', { name: 'Send response' }));
    expect(respond).toHaveBeenCalledWith(question('async'), {
      action: 'answer',
      answer: 'Stiffness',
    });
  });
  it('keeps MCP questions on their own response controls', () => {
    render(
      <QuestionAnswerContext.Provider value={{ startAnswer: vi.fn(), stopAnswer: vi.fn() }}>
        <AgentQuestionDialog
          interaction={{
            ...question('blocking'),
            source: { protocol: 'mcp', tool_name: 'dataset.lookup' },
          }}
          onClose={vi.fn()}
          onResponse={vi.fn()}
        />
      </QuestionAnswerContext.Provider>,
    );
    expect(screen.queryByRole('button', { name: 'Answer in message box' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeVisible();
  });
});
