import { beforeEach, describe, expect, it } from 'vitest';
import type { TransportFrame } from '@clio/core/v3';
import { useLiveStore } from './live-store';

function workspaceFrame(
  cursor: string,
  id: string,
  eventName = 'workspace.upserted',
): TransportFrame {
  return {
    cursor,
    eventName,
    receivedAt: '2026-08-27T12:00:00Z',
    data: {
      protocol_version: '0.3',
      type: 'workspace.upserted',
      occurred_at: '2026-08-27T12:00:00Z',
      scope: { connection_id: 'local', workspace_id: id },
      entity_id: id,
      entity_revision: 1,
      payload: {
        id,
        name: id,
        display_name: id,
        path: `D:/${id}`,
        connection_id: 'local',
      },
    },
  };
}

function streamedFrame(
  cursor: string,
  type: 'message.upserted' | 'session.upserted',
  entityId: string,
  payload: Record<string, unknown>,
): TransportFrame {
  return {
    cursor,
    eventName: type,
    receivedAt: '2026-08-27T12:00:00Z',
    data: {
      protocol_version: '0.3',
      type,
      occurred_at: '2026-08-27T12:00:00Z',
      scope: { connection_id: 'local', workspace_id: 'ws_1', session_id: 'sess_1' },
      entity_id: entityId,
      entity_revision: 4,
      payload,
    },
  };
}

function restMessage(id: string) {
  return {
    id,
    session_id: 'sess_1',
    role: 'assistant' as const,
    created_at: '2026-08-27T12:00:00Z',
    blocks: [],
  };
}

function restSession(id: string, state: 'running' | 'completed' | 'queued') {
  return {
    id,
    workspace_id: 'ws_1',
    title: id,
    state,
    created_at: '2026-08-27T12:00:00Z',
    updated_at: '2026-08-27T12:00:00Z',
    mode: 'edit' as const,
    edit_mode: 'diff' as const,
    routing_mode: 'auto' as const,
    approval_mode: 'ask' as const,
    pinned: false,
    archived: false,
  };
}

describe('live store snapshot merges', () => {
  beforeEach(() => useLiveStore.getState().reset());

  it('keeps an in-flight streamed message a lagging transcript snapshot omits', () => {
    useLiveStore
      .getState()
      .applyFrames([streamedFrame('10', 'message.upserted', 'msg_b', restMessage('msg_b'))]);

    useLiveStore.getState().mergeSnapshots({ messages: { msg_a: restMessage('msg_a') } });

    expect(Object.keys(useLiveStore.getState().entities.messages).sort()).toEqual([
      'msg_a',
      'msg_b',
    ]);
  });

  it('refuses to rewind a stream-owned session to a stale poll snapshot', () => {
    useLiveStore
      .getState()
      .applyFrames([
        streamedFrame('11', 'session.upserted', 'sess_1', restSession('sess_1', 'completed')),
      ]);

    useLiveStore.getState().mergeSnapshots({
      sessions: {
        sess_1: restSession('sess_1', 'running'),
        sess_2: restSession('sess_2', 'queued'),
      },
    });

    const sessions = useLiveStore.getState().entities.sessions;
    expect(sessions.sess_1?.state).toBe('completed');
    expect(sessions.sess_2?.state).toBe('queued');
  });

  it('drops a row the snapshot no longer lists when the stream never wrote it', () => {
    useLiveStore.getState().mergeSnapshots({ sessions: { sess_2: restSession('sess_2', 'queued') } });
    useLiveStore.getState().mergeSnapshots({ sessions: { sess_3: restSession('sess_3', 'queued') } });

    expect(Object.keys(useLiveStore.getState().entities.sessions)).toEqual(['sess_3']);
  });
});

describe('live store reconciliation', () => {
  beforeEach(() => useLiveStore.getState().reset());

  it('drops an obsolete stream cursor after authoritative gap recovery', () => {
    useLiveStore.setState((state) => ({
      entities: {
        ...state.entities,
        cursor: '435',
        processed_cursors: ['433', '434', '435'],
        stream: 'gapped',
      },
    }));

    useLiveStore.getState().reconcileSnapshots({
      messages: {},
      revisions: {},
    });

    const entities = useLiveStore.getState().entities;
    expect(entities.cursor).toBeUndefined();
    expect(entities.processed_cursors).toEqual([]);
    expect(entities.stream).toBe('gapped');
  });

  it('keeps ordinary REST snapshot refreshes on the active timeline', () => {
    useLiveStore.setState((state) => ({
      entities: {
        ...state.entities,
        cursor: '52',
        processed_cursors: ['51', '52'],
      },
    }));

    useLiveStore.getState().replaceSnapshots({ messages: {} });

    const entities = useLiveStore.getState().entities;
    expect(entities.cursor).toBe('52');
    expect(entities.processed_cursors).toEqual(['51', '52']);
  });

  it('isolates one malformed frame without discarding valid neighbors', () => {
    useLiveStore.getState().applyFrames([
      workspaceFrame('1', 'ws_before'),
      {
        cursor: '2',
        eventName: 'workspace.upserted',
        receivedAt: '2026-08-27T12:00:01Z',
        data: { protocol_version: '0.3', broken: true },
      },
      workspaceFrame('3', 'ws_after'),
    ]);

    const state = useLiveStore.getState();
    expect(Object.keys(state.entities.workspaces)).toEqual(['ws_before', 'ws_after']);
    expect(state.entities.stream).not.toBe('gapped');
    expect(state.frameGaps).toMatchObject([
      { cursor: '2', code: 'frame_decode_failed', event_name: 'workspace.upserted' },
    ]);
  });

  it('records an event-name mismatch while applying the canonical envelope', () => {
    useLiveStore.getState().applyFrames([workspaceFrame('4', 'ws_mismatch', 'message.upserted')]);

    const state = useLiveStore.getState();
    expect(state.entities.workspaces.ws_mismatch).toBeDefined();
    expect(state.frameGaps).toMatchObject([
      {
        cursor: '4',
        code: 'event_name_mismatch',
        event_name: 'message.upserted',
        entity_id: 'ws_mismatch',
      },
    ]);
  });
});
