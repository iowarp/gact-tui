import type { PendingInteraction } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { responseTrayInteractions } from './workspace-route-state';
import { OpenQuestionsSection } from './open-question-list';
import { AgentAnswerActivity } from './agent-answer-activity';
import { ATTENTION_REVEAL_EVENT } from './interaction-control';
import { AgentQuestionDialog } from './agent-question-dialog';
import { QuestionAnswerContext } from './question-answer-context';

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
  it('keeps a pending question to its activity row in the log, answered in the ask card', async () => {
    const revealed = vi.fn();
    window.addEventListener(ATTENTION_REVEAL_EVENT, revealed);
    render(<AgentAnswerActivity interaction={question('async')} />);
    expect(screen.getByText('waiting for you')).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Answer below: What does X mean?' }));
    expect(revealed).toHaveBeenCalledTimes(1);
    window.removeEventListener(ATTENTION_REVEAL_EVENT, revealed);
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
