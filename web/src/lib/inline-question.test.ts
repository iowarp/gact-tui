import type { Message, PendingInteraction } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  ANSWER_ATTACHMENTS_UNSUPPORTED,
  isToolAnchoredQuestion,
  pendingLogQuestions,
  questionAnswerFromComposer,
  questionLink,
} from './inline-question';

function question(overrides: Partial<PendingInteraction> = {}): PendingInteraction {
  return {
    id: 'question:q1',
    kind: 'question',
    status: 'pending',
    session_id: 'session_1',
    owner_session_id: 'session_1',
    attended_session_id: 'session_1',
    title: 'Question',
    prompt: 'Which account should the job charge?',
    created_at: '2026-09-26T10:00:00Z',
    actions: ['answer', 'cancel'],
    source: { protocol: 'native', tool_name: 'ask_user', invocation_id: 'call_1' },
    ...overrides,
  } as PendingInteraction;
}

describe('isToolAnchoredQuestion', () => {
  it('is the agent asking with its own tool', () => {
    expect(isToolAnchoredQuestion(question())).toBe(true);
  });

  it('excludes plan reviews, MCP requests and questions without a tool call', () => {
    expect(
      isToolAnchoredQuestion(
        question({ source: { protocol: 'native', tool_name: 'plan_exit', invocation_id: 'c' } }),
      ),
    ).toBe(false);
    expect(
      isToolAnchoredQuestion(
        question({ source: { protocol: 'mcp', tool_name: 'x', invocation_id: 'c' } }),
      ),
    ).toBe(false);
    expect(
      isToolAnchoredQuestion(question({ source: { protocol: 'native', tool_name: 'ask_user' } })),
    ).toBe(false);
    expect(isToolAnchoredQuestion(question({ kind: 'permission' }))).toBe(false);
  });
});

describe('pendingLogQuestions', () => {
  it('lists pending questions whose tool call is loaded, oldest first', () => {
    const later = question({
      id: 'question:q2',
      created_at: '2026-09-26T11:00:00Z',
      source: { protocol: 'native', tool_name: 'ask_user', invocation_id: 'call_2' },
    });
    const answered = question({ id: 'question:q3', status: 'answered' });
    const unloaded = question({
      id: 'question:q4',
      source: { protocol: 'native', tool_name: 'ask_user', invocation_id: 'call_9' },
    });

    const rows = pendingLogQuestions(
      [later, answered, unloaded, question()],
      new Set(['call_1', 'call_2']),
    );

    expect(rows.map((row) => row.id)).toEqual(['question:q1', 'question:q2']);
  });
});

describe('questionLink', () => {
  it('links to the message holding the tool call', () => {
    const messages = [
      { id: 'm1', blocks: [{ id: 'b1', type: 'text', text: 'hi' }] },
      { id: 'm2', blocks: [{ id: 'b2', type: 'tool', tool_id: 'call_1' }] },
    ] as unknown as Message[];

    expect(questionLink(messages, question())).toBe('#message-m2/activity-call_1');
    expect(questionLink([], question())).toBeUndefined();
  });
});

describe('questionAnswerFromComposer', () => {
  it('answers the picked question with the message text', () => {
    expect(questionAnswerFromComposer(question(), { text: '  hochhalter  ' })).toEqual({
      interaction: question(),
      response: { action: 'answer', answer: 'hochhalter' },
    });
  });

  it('leaves ordinary messages alone when no question was picked', () => {
    expect(questionAnswerFromComposer(undefined, { text: 'hello' })).toBeUndefined();
    expect(
      questionAnswerFromComposer(question({ status: 'answered' }), { text: 'hello' }),
    ).toBeUndefined();
  });

  it('refuses attachments instead of dropping them', () => {
    expect(() =>
      questionAnswerFromComposer(question(), { text: 'see file', files: [{ name: 'a.csv' }] }),
    ).toThrow(ANSWER_ATTACHMENTS_UNSUPPORTED);
  });
});
