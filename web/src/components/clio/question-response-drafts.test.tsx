import type { PendingInteraction } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionResponse } from './pending-interaction-question-response';
import { QuestionAnswerContext, useQuestionDrafts } from './question-answer-context';

afterEach(cleanup);

function question(id = 'q1', payload: PendingInteraction['payload'] = {}): PendingInteraction {
  return {
    id: 'question:' + id,
    kind: 'question',
    status: 'pending',
    owner_session_id: 'session_1',
    attended_session_id: 'session_1',
    title: 'Question',
    prompt: 'Choose the sample.',
    created_at: '2026-10-16T00:00:00Z',
    actions: ['answer', 'cancel'],
    source: { protocol: 'native', tool_name: 'ask_user', invocation_id: 'call_' + id },
    payload: { question_kind: 'freeform', allow_freeform: true, ...payload },
  };
}

const respond = vi.fn().mockResolvedValue(undefined);

function Owner({
  row = question(),
  inventory = [row],
  surface = 'desktop',
  endpoint = 'http://service-a',
  sessionId = 'session_1',
}: {
  row?: PendingInteraction;
  inventory?: PendingInteraction[];
  surface?: string;
  endpoint?: string;
  sessionId?: string;
}) {
  const responseDrafts = useQuestionDrafts(endpoint, sessionId, inventory);
  return (
    <QuestionAnswerContext.Provider
      value={{ responseDrafts, startAnswer: vi.fn(), stopAnswer: vi.fn() }}
    >
      <QuestionResponse key={surface} interaction={row} showOwner={false} onResponse={respond} />
    </QuestionAnswerContext.Provider>
  );
}

describe('session-owned Question drafts', () => {
  it('retains an unsent answer across response-surface remounts and submits it once', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    function Form({ surface }: { surface: string }) {
      const row = question();
      const responseDrafts = useQuestionDrafts('http://service-a', 'session_1', [row]);
      return (
        <QuestionAnswerContext.Provider
          value={{ responseDrafts, startAnswer: vi.fn(), stopAnswer: vi.fn() }}
        >
          <QuestionResponse key={surface} interaction={row} showOwner={false} onResponse={send} />
        </QuestionAnswerContext.Provider>
      );
    }
    const view = render(<Form surface="desktop" />);
    await userEvent.type(screen.getByRole('textbox'), 'sample alpha');
    view.rerender(<Form surface="phone" />);
    expect(screen.getByRole('textbox')).toHaveValue('sample alpha');
    view.rerender(<Form surface="desktop" />);
    expect(screen.getByRole('textbox')).toHaveValue('sample alpha');
    expect(send).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Send response' }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(question(), { action: 'answer', answer: 'sample alpha' });
  });

  it('keeps different Question drafts separate without requiring a remount', async () => {
    const first = question('q1');
    const second = question('q2');
    const inventory = [first, second];
    const view = render(<Owner row={first} inventory={inventory} />);
    await userEvent.type(screen.getByRole('textbox'), 'first sample');
    view.rerender(<Owner row={second} inventory={inventory} />);
    expect(screen.getByRole('textbox')).toHaveValue('');
    await userEvent.type(screen.getByRole('textbox'), 'second sample');
    view.rerender(<Owner row={first} inventory={inventory} />);
    expect(screen.getByRole('textbox')).toHaveValue('first sample');
  });

  it('isolates the same Question identity across sessions and services', async () => {
    const row = question();
    const view = render(<Owner row={row} />);
    await userEvent.type(screen.getByRole('textbox'), 'private first draft');
    view.rerender(<Owner row={row} sessionId="session_2" />);
    expect(screen.getByRole('textbox')).toHaveValue('');
    await userEvent.type(screen.getByRole('textbox'), 'private second draft');
    view.rerender(<Owner row={row} sessionId="session_2" endpoint="http://service-b" />);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('preserves selections and comments when moving a multiple-choice response', async () => {
    const row = question('multi', {
      question_kind: 'multi_choice',
      allow_freeform: false,
      options: [
        { label: 'Alpha', value: 'alpha' },
        { label: 'Beta', value: 'beta' },
      ],
    });
    const view = render(<Owner row={row} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Alpha' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add comment on Alpha' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Comment on Alpha' }), 'first batch');
    view.rerender(<Owner row={row} surface="phone" />);
    expect(screen.getByRole('checkbox', { name: 'Alpha' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Beta' })).not.toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Comment on Alpha' })).toHaveValue('first batch');
  });

  it('preserves structured field edits rather than reverting to server defaults', async () => {
    const row = question('form', {
      mode: 'form',
      fields: [{ name: 'sample', title: 'Sample', type: 'string', default: 'baseline' }],
    });
    const view = render(<Owner row={row} />);
    expect(screen.getByRole('textbox')).toHaveValue('baseline');
    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.type(screen.getByRole('textbox'), 'revised sample');
    view.rerender(<Owner row={row} surface="dialog" />);
    expect(screen.getByRole('textbox')).toHaveValue('revised sample');
  });

  it('retains a draft when an incomplete inventory temporarily omits the Question', async () => {
    const row = question();
    const view = render(<Owner row={row} />);
    await userEvent.type(screen.getByRole('textbox'), 'keep while disconnected');
    view.rerender(<Owner row={row} inventory={[]} surface="phone" />);
    expect(screen.getByRole('textbox')).toHaveValue('keep while disconnected');
  });
});
