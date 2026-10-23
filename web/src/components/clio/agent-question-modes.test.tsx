import type { PendingInteraction } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { responseTrayInteractions } from './workspace-route-state';
import { OpenQuestionsTracker } from './open-questions-tracker';
import { OpenQuestionsSection } from './open-question-list';
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
  it('keeps both blocking and async questions reachable in the attention pager', () => {
    const rows = [question('async'), question('blocking')];
    expect(responseTrayInteractions(rows, new Set(['tool1']))).toEqual(rows);
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
    expect(screen.getByRole('dialog', { name: 'Open questions' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Read and answer question 1' }));
    expect(openQuestion).toHaveBeenCalledWith(question('async'));
  });
  it('links to the question source without answering or opening the response dialog', async () => {
    const openQuestion = vi.fn();
    render(
      <QuestionAnswerContext.Provider
        value={{
          openQuestion,
          questionLink: () => '#message-m1/activity-tool1',
          startAnswer: vi.fn(),
          stopAnswer: vi.fn(),
        }}
      >
        <OpenQuestionsTracker bottomInset={80} interactions={[question('async')]} />
      </QuestionAnswerContext.Provider>,
    );
    await userEvent.click(screen.getByRole('button', { name: '1 open question' }));
    await userEvent.click(screen.getByRole('button', { name: 'Go to question 1' }));
    expect(window.location.hash).toBe('#message-m1/activity-tool1');
    expect(openQuestion).not.toHaveBeenCalled();
    window.location.hash = '';
  });
  it('opens the list on hover and expands one question without starting an answer', async () => {
    const openQuestion = vi.fn();
    render(
      <QuestionAnswerContext.Provider
        value={{ openQuestion, startAnswer: vi.fn(), stopAnswer: vi.fn() }}
      >
        <OpenQuestionsTracker
          bottomInset={80}
          interactions={[question('async'), question('blocking')]}
        />
      </QuestionAnswerContext.Provider>,
    );
    await userEvent.hover(screen.getByRole('button', { name: '2 open questions' }));
    expect(await screen.findByRole('dialog', { name: 'Open questions' })).toBeVisible();
    expect(screen.queryByText('Answer when ready')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Expand question 1' }));
    expect(screen.getByText('Answer when ready')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Expand question 2' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(openQuestion).not.toHaveBeenCalled();
  });
  it('keeps the same live questions in Work and removes a resolved question', async () => {
    const rows = [question('async'), question('blocking')];
    const openQuestion = vi.fn();
    const content = (interactions: PendingInteraction[]) => (
      <QuestionAnswerContext.Provider
        value={{ interactions, openQuestion, startAnswer: vi.fn(), stopAnswer: vi.fn() }}
      >
        <OpenQuestionsSection />
      </QuestionAnswerContext.Provider>
    );
    const view = render(content(rows));
    await userEvent.click(screen.getByRole('button', { name: 'Read and answer question 2' }));
    expect(openQuestion).toHaveBeenCalledWith(rows[1]);
    view.rerender(content([{ ...rows[0]!, status: 'answered' }, rows[1]!]));
    expect(screen.getByRole('button', { name: 'Open questions, 1 recorded' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Read and answer question 2' }),
    ).not.toBeInTheDocument();
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
    expect(screen.getByRole('dialog')).toHaveClass('top-1/2', '-translate-y-1/2', 'sm:max-w-xl');
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
