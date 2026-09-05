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

describe('GACT 0.3 reducer', () => {
  it('coalesces ordered blocks and deltas without inventing text', () => {
    const created = frame('1', 'message.upserted', {
      id: 'msg_1',
      session_id: 'sess_1',
      role: 'assistant',
      created_at: '2026-08-22T12:00:00Z',
      blocks: [],
    });
    const added = frame(
      '2',
      'message.block.upserted',
      {
        message_id: 'msg_1',
        block: { id: 'part_1', type: 'text', text: '', streaming: true },
      },
      { entityId: 'part_1', revision: 2 },
    );
    const deltaA = frame(
      '3',
      'message.block.delta',
      { message_id: 'msg_1', block_id: 'part_1', delta: 'flat-' },
      { entityId: 'part_1', revision: 3 },
    );
    const deltaB = frame(
      '4',
      'message.block.delta',
      { message_id: 'msg_1', block_id: 'part_1', delta: 'NDP' },
      { entityId: 'part_1', revision: 4 },
    );

    const state = [created, added, deltaA, deltaB].reduce(
      reduceTransportFrame,
      createEntityState(),
    );

    expect(state.messages.msg_1?.blocks).toEqual([
      { id: 'part_1', type: 'text', text: 'flat-NDP', streaming: true },
    ]);
  });

  it('retains completed usage from the live wire', () => {
    const created = frame('1', 'message.upserted', {
      id: 'msg_1',
      session_id: 'sess_1',
      role: 'assistant',
      created_at: '2026-08-22T12:00:00Z',
      blocks: [],
      usage: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
      cost_usd: 0,
    });
    const completed = frame('2', 'message.completed', {
      message_id: 'msg_1',
      completed_at: '2026-08-22T12:00:03Z',
      stop_reason: 'end_turn',
      tokens: { input: 120, output: 45, cache_read: 30, cache_write: 0 },
      cost_usd: 0.0125,
    });

    const state = [created, completed].reduce(reduceTransportFrame, createEntityState());

    expect(state.messages.msg_1).toMatchObject({
      completed_at: '2026-08-22T12:00:03Z',
      stop_reason: 'end_turn',
      usage: { input: 120, output: 45, cache_read: 30, cache_write: 0 },
      cost_usd: 0.0125,
    });
  });

  it('ignores duplicate cursors and stale entity revisions', () => {
    const initial = frame(
      '20',
      'session.upserted',
      {
        id: 'sess_1',
        workspace_id: 'ws_1',
        title: 'Canonical',
        state: 'running',
        created_at: '2026-08-22T12:00:00Z',
        updated_at: '2026-08-22T12:00:01Z',
      },
      { entityId: 'sess_1', revision: 20 },
    );
    const stale = frame(
      '21',
      'session.upserted',
      {
        id: 'sess_1',
        workspace_id: 'ws_1',
        title: 'Stale',
        state: 'completed',
        created_at: '2026-08-22T12:00:00Z',
        updated_at: '2026-08-22T11:59:00Z',
      },
      { entityId: 'sess_1', revision: 19 },
    );

    const once = reduceTransportFrame(createEntityState(), initial);
    const duplicate = reduceTransportFrame(once, initial);
    const final = reduceTransportFrame(duplicate, stale);

    expect(duplicate).toBe(once);
    expect(final.sessions.sess_1?.title).toBe('Canonical');
    expect(final.cursor).toBe('21');
  });

  it('records a typed gap for a frame whose entity is not resident yet', () => {
    const orphan = frame(
      '30',
      'message.block.completed',
      { message_id: 'msg_missing', block_id: 'part_1', text: 'Final answer' },
      { entityId: 'part_1', revision: 30 },
    );
    const created = frame('31', 'message.upserted', {
      id: 'msg_missing',
      session_id: 'sess_1',
      role: 'assistant',
      created_at: '2026-08-22T12:00:00Z',
      blocks: [{ id: 'part_1', type: 'text', text: 'Final', streaming: true }],
    });
    const redelivered = frame(
      '32',
      'message.block.completed',
      { message_id: 'msg_missing', block_id: 'part_1', text: 'Final answer' },
      { entityId: 'part_1', revision: 30 },
    );

    const dropped = reduceTransportFrame(createEntityState(), orphan);

    expect(dropped.gaps).toEqual([
      {
        cursor: '30',
        event_name: 'message.block.completed',
        entity_id: 'part_1',
        code: 'entity_not_resident',
        reason: 'Message msg_missing is not resident for its completed block',
        received_at: '2026-08-22T12:00:00Z',
      },
    ]);
    expect(dropped.revisions).toEqual({});

    const recovered = [created, redelivered].reduce(reduceTransportFrame, dropped);

    expect(recovered.messages.msg_missing?.blocks).toEqual([
      { id: 'part_1', type: 'text', text: 'Final answer', streaming: false },
    ]);
    expect(recovered.gaps).toHaveLength(1);
  });

  it('applies both id-zero connection preamble frames', () => {
    const live = frame('0', 'stream.live', {});
    const session = frame('0', 'session.upserted', {
      id: 'sess_1',
      workspace_id: 'ws_1',
      title: 'Preamble snapshot',
      state: 'completed',
      created_at: '2026-08-22T12:00:00Z',
      updated_at: '2026-08-22T12:00:00Z',
    });

    const state = [live, session].reduce(reduceTransportFrame, createEntityState());

    expect(state.stream).toBe('live');
    expect(state.sessions.sess_1?.title).toBe('Preamble snapshot');
    expect(state.processed_cursors).toEqual([]);
  });

  it('replaces a live tool call in place without breaking causal order', () => {
    const message = frame('1', 'message.upserted', {
      id: 'msg_1',
      session_id: 'sess_1',
      role: 'assistant',
      created_at: '2026-08-22T12:00:00Z',
      blocks: [],
    });
    const call = frame('2', 'message.block.upserted', {
      message_id: 'msg_1',
      block: { id: 'call_part', type: 'tool', tool_id: 'call_1' },
    });
    const surface = frame('3', 'message.block.upserted', {
      message_id: 'msg_1',
      block: { id: 'surface_part', type: 'a2ui', surface_id: 'surface_1' },
    });
    const result = frame('4', 'message.block.upserted', {
      message_id: 'msg_1',
      block: { id: 'result_part', type: 'tool', tool_id: 'call_1' },
    });

    const state = [message, call, surface, result].reduce(
      reduceTransportFrame,
      createEntityState(),
    );

    expect(state.messages.msg_1?.blocks).toEqual([
      { id: 'result_part', type: 'tool', tool_id: 'call_1' },
      { id: 'surface_part', type: 'a2ui', surface_id: 'surface_1' },
    ]);
  });

  it('marks a replay gap for authoritative snapshot reconciliation', () => {
    const state = reduceTransportFrame(
      createEntityState(),
      frame('91', 'stream.gap', { oldest_available_cursor: '80' }),
    );

    expect(state.stream).toBe('gapped');
    expect(state.cursor).toBe('91');
  });

  it('keeps a deleted A2UI tombstone so transcript history remains causal', () => {
    const created = frame('92', 'a2ui.surface.upserted', {
      id: 'surface_1',
      session_id: 'sess_1',
      catalog_id: 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1',
      protocol_version: '0.9.1',
      revision: 2,
      state: 'ready',
      messages: [],
    });
    const deleted = frame('93', 'a2ui.surface.deleted', { surface_id: 'surface_1' });

    const state = [created, deleted].reduce(reduceTransportFrame, createEntityState());

    expect(state.surfaces.surface_1?.state).toBe('deleted');
  });

  it('normalizes approvals, questions, and child-agent lifecycle into entities', () => {
    const requested = frame('101', 'approval.upserted', {
      id: 'perm_1',
      session_id: 'sess_1',
      tool_name: 'shell.exec',
      input: { cmd: 'inspect' },
      summary: 'Run a protected command',
      status: 'pending',
      created_at: '2026-08-22T12:00:00Z',
    });
    const resolved = frame('102', 'approval.resolved', {
      id: 'perm_1',
      action: 'allow_session',
      status: 'approved',
      resolved_at: '2026-08-22T12:00:01Z',
    });
    const question = frame('103', 'question.upserted', {
      id: 'ques_1',
      session_id: 'sess_1',
      prompt: 'Continue?',
      status: 'pending',
      kind: 'confirmation',
      options: [],
      selected_options: [],
      created_at: '2026-08-22T12:00:00Z',
      updated_at: '2026-08-22T12:00:00Z',
    });
    const child = frame('104', 'subagent.upserted', {
      id: 'task_1',
      session_id: 'sess_1',
      parent_run_id: 'run_1',
      title: 'Data expert #1',
      state: 'running',
    });

    const state = [requested, resolved, question, child].reduce(
      reduceTransportFrame,
      createEntityState(),
    );

    expect(state.approvals.perm_1).toMatchObject({
      status: 'approved',
      action: 'allow_session',
    });
    expect(state.questions.ques_1?.prompt).toBe('Continue?');
    expect(state.subagents.task_1).toMatchObject({ title: 'Data expert #1', state: 'running' });
  });

  it('projects infrastructure readiness transitions in place', () => {
    const launching = frame('105', 'infrastructure.dependency.changed', {
      id: 'sess_1:mcp:geo',
      session_id: 'sess_1',
      category: 'mcp',
      namespace: 'geo',
      title: 'Geospatial tools',
      phase: 'launch',
      state: 'running',
      attempt: 1,
      max_attempts: 3,
    });
    const connected = frame('106', 'infrastructure.dependency.changed', {
      id: 'sess_1:mcp:geo',
      session_id: 'sess_1',
      category: 'mcp',
      namespace: 'geo',
      title: 'Geospatial tools',
      phase: 'connect',
      state: 'ready',
      attempt: 2,
      max_attempts: 3,
      tool_count: 4,
    });

    const state = [launching, connected].reduce(reduceTransportFrame, createEntityState());

    expect(state.infrastructure['sess_1:mcp:geo']).toMatchObject({
      state: 'ready',
      phase: 'connect',
      attempt: 2,
      tool_count: 4,
      observed_active: true,
    });
  });

  it('starts each turn with a fresh infrastructure preparation projection', () => {
    const launching = frame('107', 'infrastructure.dependency.changed', {
      id: 'sess_1:mcp:geo',
      session_id: 'sess_1',
      category: 'mcp',
      namespace: 'geo',
      title: 'Geo MCP',
      phase: 'launch',
      state: 'running',
      attempt: 1,
      max_attempts: 3,
    });
    const turnStarted = frame('108', 'turn.started', { turn_id: 'msg_user_2' });

    const state = [launching, turnStarted].reduce(reduceTransportFrame, createEntityState());

    expect(state.infrastructure).toEqual({});
  });

  it('guards revisions per entity, not per event type on that entity', () => {
    const upserted = frame(
      '200',
      'message.upserted',
      {
        id: 'msg_1',
        session_id: 'sess_1',
        role: 'assistant',
        created_at: '2026-08-22T12:00:00Z',
        blocks: [],
      },
      { entityId: 'msg_1', revision: 5 },
    );
    // The same entity at an older revision: a replayed completion the service
    // already superseded. §7.8 orders by entity, so the event type it arrives
    // under cannot buy it a second, private revision counter.
    const staleCompletion = frame(
      '201',
      'message.completed',
      { message_id: 'msg_1', completed_at: '2026-08-22T11:00:00Z', stop_reason: 'stale' },
      { entityId: 'msg_1', revision: 3 },
    );

    const state = [upserted, staleCompletion].reduce(reduceTransportFrame, createEntityState());

    expect(state.messages.msg_1?.completed_at).toBeUndefined();
    expect(state.messages.msg_1?.stop_reason).toBeUndefined();
    expect(state.revisions).toEqual({ msg_1: 5 });
  });

  it('carries interleaved queued-message revisions without banking either', () => {
    const updated = frame(
      '210',
      'queued_message.updated',
      { queued_message: { id: 'qm_1', revision: 5 } },
      { entityId: 'qm_1', revision: 5 },
    );
    const reordered = frame(
      '211',
      'queued_message.reordered',
      { queued_messages: [{ id: 'qm_1', revision: 3 }] },
      { entityId: 'qm_1', revision: 3 },
    );

    const state = [updated, reordered].reduce(reduceTransportFrame, createEntityState());

    // Neither event projects an entity this store holds, so neither may claim a
    // revision — the authoritative re-read the surface schedules is the answer.
    expect(state.revisions).toEqual({});
    expect(state.processed_cursors).toEqual(['210', '211']);
  });

  it('lets a redelivered frame apply after an unreduced frame carried a later revision', () => {
    // `entity_revision` is the service's own event sequence, so a composer
    // event this store projects nothing for can sit between two message frames
    // and carry a higher number than either.
    const upserted = frame(
      '220',
      'message.upserted',
      {
        id: 'msg_1',
        session_id: 'sess_1',
        role: 'assistant',
        created_at: '2026-08-22T12:00:00Z',
        blocks: [],
      },
      { entityId: 'msg_1', revision: 2 },
    );
    const unreduced = frame(
      '221',
      'message.cancelled',
      { message_id: 'msg_1', session_id: 'sess_1' },
      { entityId: 'msg_1', revision: 9 },
    );
    const completion = frame(
      '222',
      'message.completed',
      { message_id: 'msg_1', completed_at: '2026-08-22T12:00:05Z', stop_reason: 'end_turn' },
      { entityId: 'msg_1', revision: 5 },
    );

    const state = [upserted, unreduced, completion].reduce(
      reduceTransportFrame,
      createEntityState(),
    );

    expect(state.messages.msg_1?.stop_reason).toBe('end_turn');
    expect(state.revisions).toEqual({ msg_1: 5 });
  });
});
