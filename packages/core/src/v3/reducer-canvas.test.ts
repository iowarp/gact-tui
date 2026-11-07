import { describe, expect, it } from 'vitest';
import { createEntityState, reduceTransportFrame } from './reducer.js';
import type { TransportFrame } from './transport.js';

function frame(
  cursor: string,
  type: string,
  payload: unknown,
  options: { entityId?: string; revision?: number } = {},
): TransportFrame {
  return {
    cursor,
    eventName: type,
    receivedAt: '2026-08-22T12:00:00Z',
    data: {
      protocol_version: '0.3',
      type,
      occurred_at: '2026-08-22T12:00:00Z',
      scope: { connection_id: 'local', workspace_id: 'ws_1', session_id: 'sess_1' },
      entity_id: options.entityId,
      entity_revision: options.revision,
      payload,
    },
  };
}

describe('GACT 0.3 reducer diffusion canvas', () => {
  it('overwrites a live diffusion canvas and drops it once content is recorded', () => {
    const created = frame('1', 'message.upserted', {
      id: 'msg_d',
      session_id: 'sess_1',
      role: 'assistant',
      created_at: '2026-08-22T12:00:00Z',
      blocks: [],
    });
    // Transient frames carry no SSE id, so their cursor is empty.
    const canvas = (step: number, text: string, revision: number) =>
      frame(
        '',
        'message.canvas',
        { message_id: 'msg_d', step, text, turn_id: 't' },
        {
          entityId: 'msg_d',
          revision,
        },
      );
    let state = [created, canvas(1, 'Thx q#ick br%wn', 2), canvas(2, 'The quick brown', 3)].reduce(
      reduceTransportFrame,
      createEntityState(),
    );
    expect(state.messages.msg_d?.canvas).toEqual({ text: 'The quick brown', step: 2 });
    expect(state.messages.msg_d?.blocks).toEqual([]);
    expect(state.processed_cursors).toEqual(['1']);

    state = reduceTransportFrame(
      state,
      frame('4', 'message.block.upserted', {
        message_id: 'msg_d',
        block: { id: 'part_d', type: 'text', text: 'The quick brown fox', streaming: true },
      }),
    );
    expect(state.messages.msg_d?.canvas).toBeUndefined();
    expect(state.messages.msg_d?.blocks).toHaveLength(1);

    state = reduceTransportFrame(state, canvas(1, 'next call', 5));
    state = reduceTransportFrame(
      state,
      frame('6', 'message.completed', { message_id: 'msg_d', stop_reason: 'end_turn' }),
    );
    expect(state.messages.msg_d?.canvas).toBeUndefined();
    // A preview arriving after completion does not reopen the settled bubble.
    state = reduceTransportFrame(state, canvas(2, 'stale', 7));
    expect(state.messages.msg_d?.canvas).toBeUndefined();
  });

  it('rejects a malformed canvas and records one for a message it does not hold', () => {
    expect(() =>
      reduceTransportFrame(
        createEntityState(),
        frame('', 'message.canvas', { message_id: 'm', text: 'x' }),
      ),
    ).toThrow('Invalid message.canvas payload');
    const state = reduceTransportFrame(
      createEntityState(),
      frame('', 'message.canvas', { message_id: 'absent', step: 1, text: 'x' }),
    );
    expect(state.gaps.at(-1)?.code).toBe('entity_not_resident');
  });
});
