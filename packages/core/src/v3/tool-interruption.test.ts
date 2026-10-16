import { expect, it } from 'vitest';
import { createEntityState, reduceTransportFrame } from './reducer.js';
import type { TransportFrame } from './transport.js';

it('closes interrupted invocation rows while preserving tasks, settled results and other turns', () => {
  for (const stopReason of ['cancelled', 'interrupted', 'error']) {
    let state = createEntityState();
    state.messages.m = {
      id: 'm',
      session_id: 's',
      role: 'assistant',
      created_at: '2026-10-13T00:00:00Z',
      blocks: [
        { id: 'b1', type: 'tool', tool_id: 'waiter' },
        { id: 'b2', type: 'tool', tool_id: 'submitted' },
      ],
    };
    state.tools = {
      waiter: { id: 'waiter', session_id: 's', name: 'wait_tasks', state: 'running' },
      submitted: {
        id: 'submitted',
        session_id: 's',
        name: 'ask_user',
        state: 'succeeded',
        output: 'accepted',
      },
      other: { id: 'other', session_id: 's', name: 'query_tasks', state: 'running' },
    };
    state.tasks.accepted = { id: 'accepted', session_id: 's', title: 'Question', state: 'running' };
    const envelope = {
      protocol_version: '0.3',
      type: 'message.completed',
      occurred_at: '2026-10-13T00:00:01Z',
      scope: { connection_id: 'local', workspace_id: 'w', session_id: 's' },
      payload: { message_id: 'm', stop_reason: stopReason },
    };
    const frame: TransportFrame = {
      cursor: '1',
      eventName: 'message.completed',
      receivedAt: '2026-10-13T00:00:01Z',
      data: envelope,
    };
    state = reduceTransportFrame(state, frame);
    expect(state.tools.waiter?.state).toBe(stopReason === 'cancelled' ? 'cancelled' : 'failed');
    expect(state.tools.waiter?.output).toBeUndefined();
    expect(state.tools.waiter?.error).toContain('accepted tasks may continue');
    expect(state.tools.submitted).toMatchObject({ state: 'succeeded', output: 'accepted' });
    expect(state.tools.other?.state).toBe('running');
    expect(state.tasks.accepted?.state).toBe('running');
    const recordedResult = reduceTransportFrame(state, {
      ...frame,
      cursor: '2',
      eventName: 'tool.upserted',
      data: {
        ...envelope,
        type: 'tool.upserted',
        payload: {
          id: 'waiter',
          session_id: 's',
          name: 'wait_tasks',
          state: 'succeeded',
          output: 'actual result',
        },
      },
    });
    expect(recordedResult.tools.waiter).toMatchObject({
      state: 'succeeded',
      output: 'actual result',
    });
  }
});
