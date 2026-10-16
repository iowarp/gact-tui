import { expect, it } from 'vitest';
import { createEntityState, reduceTransportFrame } from './reducer.js';
import type { TransportFrame } from './transport.js';

function frame(cursor: string, type: string, payload: unknown): TransportFrame {
  return {
    cursor,
    eventName: type,
    receivedAt: '2026-10-15T18:00:00Z',
    data: {
      protocol_version: '0.3',
      type,
      occurred_at: '2026-10-15T18:00:00Z',
      scope: { connection_id: 'local', workspace_id: 'ws_1', session_id: 'sess_1' },
      payload,
    },
  };
}

it('retains completed reasoning timing on the live stream with the same fields as reload', () => {
  const started = {
    id: 'r',
    type: 'reasoning',
    text: '',
    streaming: true,
    started_at: '2026-10-15T18:00:00Z',
  };
  const message = {
    id: 'm',
    session_id: 'sess_1',
    role: 'assistant',
    created_at: '2026-10-15T18:00:00Z',
    blocks: [started],
  };
  let state = reduceTransportFrame(createEntityState(), frame('1', 'message.upserted', message));
  const block = {
    ...started,
    text: 'Inspecting the file.',
    completed_at: '2026-10-15T18:00:12.400Z',
    duration_ms: 12400,
    streaming: false,
  };
  state = reduceTransportFrame(
    state,
    frame('2', 'message.block.completed', {
      message_id: 'm',
      block_id: 'r',
      text: block.text,
      block,
    }),
  );
  expect(state.messages.m?.blocks[0]).toEqual(block);
  const reloaded = reduceTransportFrame(
    createEntityState(),
    frame('3', 'message.upserted', { ...message, blocks: [block] }),
  );
  expect(state.messages.m?.blocks).toEqual(reloaded.messages.m?.blocks);
  expect(() =>
    reduceTransportFrame(
      state,
      frame('4', 'message.block.completed', {
        message_id: 'm',
        block_id: 'r',
        text: 'wrong',
        block: { ...block, id: 'other' },
      }),
    ),
  ).toThrow('Invalid completed reasoning identity');
});
