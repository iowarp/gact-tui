import { describe, expect, it } from 'vitest';
import type { EntityState } from './domain.js';
import { createEntityState, reduceTransportFrame } from './reducer.js';
import type { TransportFrame } from './transport.js';

let cursor = 0;

function frame(type: string, payload: unknown): TransportFrame {
  cursor += 1;
  return {
    cursor: String(cursor),
    eventName: type,
    receivedAt: '2026-10-01T12:00:00Z',
    data: {
      protocol_version: '0.3',
      type,
      occurred_at: `2026-10-01T12:00:${String(cursor % 60).padStart(2, '0')}Z`,
      scope: { connection_id: 'local', workspace_id: 'ws_1', session_id: 'sess_1' },
      payload,
    },
  };
}

function apply(state: EntityState, ...frames: TransportFrame[]): EntityState {
  return frames.reduce(reduceTransportFrame, state);
}

const userMessage = {
  id: 'msg_user',
  session_id: 'sess_1',
  turn_id: 'turn_1',
  role: 'user',
  created_at: '2026-10-01T11:59:00Z',
  blocks: [{ id: 'u1', type: 'text', text: 'Analyse the data' }],
};

const assistantMessage = {
  id: 'msg_assistant',
  session_id: 'sess_1',
  turn_id: 'turn_1',
  role: 'assistant',
  created_at: '2026-10-01T11:59:01Z',
  blocks: [{ id: 'a1', type: 'text', text: 'Reading files.' }],
};

const midTurn = {
  session_id: 'sess_1',
  compaction_id: 'cmp_1',
  scope: 'main',
  trigger: 'auto',
  turn_id: 'turn_1',
};

const summaryBlock = {
  id: 'part_summary',
  type: 'injection',
  source: 'summarization',
  text: 'The agent read three files.',
  trigger: 'auto',
  compaction_id: 'cmp_1',
};

function transcript(): EntityState {
  return apply(
    createEntityState(),
    frame('message.upserted', userMessage),
    frame('message.upserted', assistantMessage),
  );
}

describe('compaction events', () => {
  it('positions a mid-turn compaction after the open turn and clears it on completion', () => {
    const started = apply(transcript(), frame('compaction.started', midTurn));
    expect(started.compactions.cmp_1).toMatchObject({
      status: 'running',
      trigger: 'auto',
      scope: 'main',
      turn_id: 'turn_1',
      anchor_message_id: 'msg_assistant',
    });

    const withSummary = apply(
      started,
      frame('message.block.upserted', { message_id: 'msg_assistant', block: summaryBlock }),
    );
    const completed = apply(
      withSummary,
      frame('compaction.completed', {
        ...midTurn,
        message_id: 'msg_assistant',
        part_id: 'part_summary',
        replaced_count: 12,
      }),
    );
    expect(completed.compactions).toEqual({});
    expect(completed.messages.msg_assistant?.blocks.at(-1)).toMatchObject({
      type: 'injection',
      source: 'summarization',
      trigger: 'auto',
    });
  });

  it('keeps the row in place when completion arrives before its summary block', () => {
    const completed = apply(
      transcript(),
      frame('compaction.started', midTurn),
      frame('compaction.completed', {
        ...midTurn,
        message_id: 'msg_assistant',
        part_id: 'part_summary',
        replaced_count: 3,
      }),
    );
    expect(completed.compactions.cmp_1).toMatchObject({
      status: 'completing',
      anchor_message_id: 'msg_assistant',
      message_id: 'msg_assistant',
      part_id: 'part_summary',
    });

    const settled = apply(
      completed,
      frame('message.upserted', {
        ...assistantMessage,
        blocks: [...assistantMessage.blocks, { ...summaryBlock, compaction_id: undefined }],
      }),
    );
    expect(settled.compactions).toEqual({});
  });

  it('anchors a between-turns compaction after the last message', () => {
    const started = apply(
      transcript(),
      frame('compaction.started', {
        ...midTurn,
        compaction_id: 'cmp_2',
        trigger: 'manual',
        turn_id: '',
      }),
    );
    expect(started.compactions.cmp_2).toMatchObject({
      status: 'running',
      trigger: 'manual',
      turn_id: '',
      anchor_message_id: 'msg_assistant',
    });

    const summaryMessage = {
      id: 'msg_summary',
      session_id: 'sess_1',
      role: 'assistant',
      created_at: '2026-10-01T12:00:30Z',
      blocks: [{ ...summaryBlock, compaction_id: 'cmp_2', trigger: 'manual' }],
    };
    const done = apply(
      started,
      frame('message.upserted', summaryMessage),
      frame('compaction.completed', {
        ...midTurn,
        compaction_id: 'cmp_2',
        trigger: 'manual',
        turn_id: '',
        message_id: 'msg_summary',
        part_id: 'part_summary',
        replaced_count: 4,
      }),
    );
    expect(done.compactions).toEqual({});
  });

  it('keeps an unrecorded failure as a typed error row at the same place', () => {
    const failed = apply(
      transcript(),
      frame('compaction.started', midTurn),
      frame('compaction.failed', {
        ...midTurn,
        part_id: '',
        error: { code: 'compaction_failure_unrecorded', message: 'No language model is bound.' },
      }),
    );
    expect(failed.compactions.cmp_1).toMatchObject({
      status: 'failed',
      anchor_message_id: 'msg_assistant',
      error: { code: 'compaction_failure_unrecorded', message: 'No language model is bound.' },
    });
    expect(failed.compactions.cmp_1?.part_id).toBeUndefined();

    // A redelivered start does not resurrect the shimmer over the failure.
    const redelivered = apply(failed, frame('compaction.started', midTurn));
    expect(redelivered.compactions.cmp_1?.status).toBe('failed');
  });

  it('hands a recorded failure to its transcript notice, in either arrival order', () => {
    const notice = {
      id: 'part_notice',
      type: 'notice',
      source: 'compaction_failed',
      text: 'No language model is bound.',
      code: 'compaction_unavailable',
      trigger: 'auto',
      compaction_id: 'cmp_1',
    };
    const failure = {
      ...midTurn,
      part_id: 'part_notice',
      error: { code: 'compaction_unavailable', message: 'No language model is bound.' },
    };

    // Event first: the row holds the error until the notice lands mid-turn.
    const failed = apply(
      transcript(),
      frame('compaction.started', midTurn),
      frame('compaction.failed', failure),
    );
    expect(failed.compactions.cmp_1).toMatchObject({ status: 'failed', part_id: 'part_notice' });
    const recorded = apply(
      failed,
      frame('message.block.upserted', {
        message_id: 'msg_assistant',
        block: { ...notice, compaction_id: undefined },
      }),
    );
    expect(recorded.compactions).toEqual({});
    expect(recorded.messages.msg_assistant?.blocks.at(-1)).toMatchObject({
      type: 'notice',
      source: 'compaction_failed',
      code: 'compaction_unavailable',
    });

    // Notice first (its own between-turns row): the failure adds no live row,
    // and a redelivered start does not bring the shimmer back.
    const noticeFirst = apply(
      transcript(),
      frame('compaction.started', midTurn),
      frame('message.upserted', {
        id: 'msg_notice_ab12',
        session_id: 'sess_1',
        role: 'assistant',
        created_at: '2026-10-01T12:00:40Z',
        blocks: [notice],
      }),
      frame('compaction.failed', failure),
      frame('compaction.started', midTurn),
    );
    expect(noticeFirst.compactions).toEqual({});
  });

  it('records a malformed compaction event as an error rather than inventing state', () => {
    expect(() =>
      reduceTransportFrame(
        transcript(),
        frame('compaction.started', { ...midTurn, trigger: 'sometimes' }),
      ),
    ).toThrow();
  });
});
