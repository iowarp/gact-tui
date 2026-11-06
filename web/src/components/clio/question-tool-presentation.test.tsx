import type { PendingInteraction, ToolInvocation } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { ClioToolInvocation } from './tool-invocation';
import { withQuestionPresentation } from './question-tool-presentation';

afterEach(cleanup);

const question: ToolInvocation = {
  id: 'ask',
  session_id: 'session',
  name: 'ask_user',
  state: 'succeeded',
  input: {
    question: 'What should govern the workshop?',
    questions: [
      { id: 'hours', question: 'What times and breaks must we preserve?' },
      {
        id: 'format',
        question: 'Which format works?',
        kind: 'choice',
        options: [
          { label: 'Local', value: 'local', description: 'Works without room internet' },
          { label: 'Cloud', value: 'cloud' },
        ],
      },
    ],
  },
  output: { accepted: true, kind: 'Question', status: 'input_required', handle: 'task_question' },
  presentation: {
    action: 'Inspect',
    summary: 'Tasks',
    blocks: [{ id: 'legacy', type: 'text', label: 'Question', text: 'input_required' }],
  },
};

it('shows the actual bundle instead of a generic inspection and protocol state', async () => {
  const user = userEvent.setup();
  render(<ClioToolInvocation compact tool={question} />);
  expect(screen.getByText('(2 questions)')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Show result for Ask you' }));
  expect(screen.getByText('What should govern the workshop?')).toBeVisible();
  expect(screen.getByText('Answer requested at this step')).toBeVisible();
  expect(screen.getByText('What times and breaks must we preserve?')).toBeVisible();
  expect(screen.getByText(/Which format works\?/)).toBeVisible();
  expect(screen.getByText(/Works without room internet/)).toBeVisible();
  expect(screen.queryByText('input_required')).toBeNull();
  expect(screen.queryByText('Tasks')).toBeNull();
  expect(screen.queryByText('Inspect')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Technical details for Ask you' }));
  expect(screen.getByRole('dialog').textContent).toContain('input_required');
});

it('separates successful posting from current answer status without leaving a stale pending label', () => {
  const pending: PendingInteraction = {
    id: 'question:task_question',
    kind: 'question',
    task_id: 'task_question',
    owner_session_id: 'session',
    attended_session_id: 'session',
    status: 'pending',
    title: 'Workshop constraints',
    source: { protocol: 'native' },
    actions: [],
    created_at: '',
  };
  const posted = withQuestionPresentation(question, [pending]);
  expect(posted.presentation?.blocks.at(-1)?.text).toBe('Waiting for your answer');
  const answered = withQuestionPresentation(posted, [{ ...pending, status: 'answered' }]);
  expect(answered.presentation?.blocks.at(-1)?.text).toBe('Answered');
});

it('keeps failed calls and their diagnostics rather than claiming a question was posted', () => {
  const failed: ToolInvocation = {
    ...question,
    state: 'failed',
    error: 'Invalid duplicate question id',
    presentation: { action: 'Inspect', summary: 'Invalid duplicate question id', blocks: [] },
  };
  expect(withQuestionPresentation(failed)).toBe(failed);
});

it('keeps ordinary task inspection untouched and presents a single confirmation separately', () => {
  const unrelated: ToolInvocation = { ...question, name: 'query_tasks' };
  expect(withQuestionPresentation(unrelated)).toBe(unrelated);
  const single = withQuestionPresentation({
    ...question,
    input: { kwargs: { question: 'Retry the operation?', kind: 'confirmation' } },
  });
  expect(single.presentation?.summary).toBe('1 question');
  expect(single.presentation?.blocks[0]?.text).toContain('Retry the operation?');
  expect(single.presentation?.blocks[0]?.text).toContain('Yes');
  expect(single.output).toBe(question.output);
});
