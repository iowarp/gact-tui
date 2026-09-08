import { describe, expect, it } from 'vitest';
import { createEntityState, reduceTransportFrame } from './reducer.js';
import type { TransportFrame } from './transport.js';

function frame(cursor: string, type: string, payload: unknown): TransportFrame {
  return {
    cursor,
    eventName: type,
    receivedAt: '2026-09-07T12:00:00Z',
    data: {
      protocol_version: '0.3',
      type,
      occurred_at: '2026-09-07T12:00:00Z',
      scope: { connection_id: 'local', workspace_id: 'ws', session_id: 'session' },
      payload,
    },
  };
}

describe('declared tool presentation stream', () => {
  const tool = {
    id: 'call',
    session_id: 'session',
    name: 'any_tool',
    state: 'running',
    presentation: {
      summary: '',
      blocks: [{ id: 'terminal', type: 'terminal', text: '🌻', stream_offset: 1 }],
    },
  };
  const delta = {
    call_id: 'call',
    block_id: 'terminal',
    offset: 1,
    sequence: 1,
    channel: 'stderr',
    text: ' warning\n',
  };
  it('appends Unicode offsets, ignores replay, and replaces with the exact completed body', () => {
    let state = reduceTransportFrame(createEntityState(), frame('1', 'tool.upserted', tool));
    state = reduceTransportFrame(state, frame('2', 'tool.presentation.delta', delta));
    state = reduceTransportFrame(state, frame('3', 'tool.presentation.delta', delta));
    expect(state.tools.call?.presentation?.blocks[0]?.text).toBe('🌻 warning\n');
    const completed = {
      ...tool,
      state: 'succeeded',
      presentation: {
        summary: '',
        blocks: [{ id: 'terminal', type: 'terminal', text: '🌻 warning\nlast', exit_code: 0 }],
      },
    };
    state = reduceTransportFrame(state, frame('4', 'tool.upserted', completed));
    state = reduceTransportFrame(
      state,
      frame('5', 'tool.presentation.delta', { ...delta, offset: 10, text: 'late' }),
    );
    expect(state.tools.call?.presentation?.blocks[0]?.text).toBe('🌻 warning\nlast');
    expect(state.tools.call?.presentation?.blocks[0]?.exit_code).toBe(0);
  });
  it('continues from a bounded reconnect tail at its absolute stream offset', () => {
    let state = reduceTransportFrame(
      createEntityState(),
      frame('1', 'tool.upserted', {
        ...tool,
        presentation: {
          summary: '',
          blocks: [{ id: 'terminal', type: 'terminal', text: 'tail', stream_offset: 9000 }],
        },
      }),
    );
    state = reduceTransportFrame(
      state,
      frame('2', 'tool.presentation.delta', { ...delta, offset: 9000, text: ' next' }),
    );
    expect(state.tools.call?.presentation?.blocks[0]?.text).toBe('tail next');
    expect(state.tools.call?.presentation?.blocks[0]?.stream_offset).toBe(9005);
  });
});
