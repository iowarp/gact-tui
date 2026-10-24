import { expect, it } from 'vitest';
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

it('merges the metadata a turn settles at its end, such as the memory it used', () => {
  const created = frame('1', 'message.upserted', {
    id: 'msg_1',
    session_id: 'sess_1',
    role: 'assistant',
    created_at: '2026-08-22T12:00:00Z',
    blocks: [],
    metadata: { behavior: { execution_mode: 'plan' } },
  });
  const completed = frame('2', 'message.completed', {
    message_id: 'msg_1',
    stop_reason: 'end_turn',
    metadata: { memory_used: { read: ['user/topics/hdf5'], loaded: [] } },
  });

  const state = [created, completed].reduce(reduceTransportFrame, createEntityState());

  expect(state.messages.msg_1?.metadata).toEqual({
    behavior: { execution_mode: 'plan' },
    memory_used: { read: ['user/topics/hdf5'], loaded: [] },
  });
});
