import type { PendingInteraction } from '@clio/core/v3';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useQuestionAnswering } from './use-question-answering';

function question(toolName = 'ask_user'): PendingInteraction {
  return {
    id: 'question:q1',
    kind: 'question',
    status: 'pending',
    owner_session_id: 'session_1',
    attended_session_id: 'session_1',
    title: 'Question',
    prompt: 'Which station list should I use?',
    created_at: '2026-09-26T10:00:00Z',
    actions: ['answer', 'cancel'],
    source: { protocol: 'native', tool_name: toolName, invocation_id: 'call_1' },
    payload: { question_id: 'q1' },
  } as PendingInteraction;
}

const base = {
  behavior: {} as never,
  delivery: 'start' as const,
};

function setup(toolName = 'ask_user') {
  const respond = vi.fn().mockResolvedValue(undefined);
  const send = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(() =>
    useQuestionAnswering({
      interactions: [question(toolName)],
      tools: [{ id: 'call_1', session_id: 'session_1', name: toolName, state: 'succeeded' }],
      messages: [],
      sessionId: 'session_1',
      focusComposer: vi.fn(),
      respond,
      send,
    }),
  );
  return { ...hook, respond, send };
}

describe('useQuestionAnswering.submit (#1448)', () => {
  it('sends an ordinary message when no question was picked', async () => {
    const { result, respond, send } = setup();

    await act(() => result.current.submit({ ...base, text: 'hello' }));

    expect(send).toHaveBeenCalledWith({ ...base, text: 'hello' });
    expect(respond).not.toHaveBeenCalled();
  });

  it('answers a picked question with text through its own route', async () => {
    const { result, respond, send } = setup();
    act(() => result.current.context.startAnswer('question:q1'));

    await act(() => result.current.submit({ ...base, text: 'the big one' }));

    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ id: 'question:q1' }), {
      action: 'answer',
      answer: 'the big one',
    });
    expect(send).not.toHaveBeenCalled();
    expect(result.current.context.answeringId).toBeUndefined();
  });

  it('never routes a pick between drafts through answers_question_id', async () => {
    const { result, respond, send } = setup('draft_alternatives');
    act(() => result.current.context.startAnswer('question:q1'));
    expect(result.current.context.answeringId).toBeUndefined();
    const files = [{ filename: 'notes.csv' }] as never;

    await act(() => result.current.submit({ ...base, text: 'something else', files }));

    expect(send).toHaveBeenCalledWith({ ...base, text: 'something else', files });
    expect(respond).not.toHaveBeenCalled();
  });

  it('sends an answer with attachments as the message that answers the question', async () => {
    const { result, respond, send } = setup();
    act(() => result.current.context.startAnswer('question:q1'));
    const files = [{ filename: 'stations.csv' }] as never;

    await act(() => result.current.submit({ ...base, text: 'attached', files }));

    expect(send).toHaveBeenCalledWith({
      ...base,
      text: 'attached',
      files,
      answersQuestionId: 'q1',
    });
    expect(respond).not.toHaveBeenCalled();
  });
});
