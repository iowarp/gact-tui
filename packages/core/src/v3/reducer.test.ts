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
});
