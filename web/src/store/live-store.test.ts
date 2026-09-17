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

  it('keeps a stream-owned row whose entity id contains colons', () => {
    const id = 'sess_1:mcp:geo';
    useLiveStore.getState().applyFrames([
      {
        cursor: '12',
        eventName: 'infrastructure.dependency.changed',
        receivedAt: '2026-08-27T12:00:00Z',
        data: {
          protocol_version: '0.3',
          type: 'infrastructure.dependency.changed',
          occurred_at: '2026-08-27T12:00:00Z',
          scope: { connection_id: 'local', workspace_id: 'ws_1', session_id: 'sess_1' },
          entity_id: id,
          entity_revision: 6,
          payload: {
            id,
            session_id: 'sess_1',
            category: 'mcp',
            namespace: 'geo',
            title: 'Geospatial tools',
            phase: 'connect',
            state: 'ready',
            attempt: 1,
            max_attempts: 3,
          },
        },
      },
    ]);

    useLiveStore.getState().mergeSnapshots({ infrastructure: {} });

    expect(useLiveStore.getState().entities.infrastructure[id]?.state).toBe('ready');
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

  // S8 gact-tui#409 item 4 (adversarial finding): `a2ui_action_lifecycles`
  // is stream-only — no REST snapshot ever carries it — so a gap reconcile
  // must not silently leave a non-terminal status exactly as it was, or the
  // footer could read "received" forever after a reconnect.
  it('marks a non-terminal a2ui action lifecycle unknown after a gap reconcile', () => {
    useLiveStore.setState((state) => ({
      entities: {
        ...state.entities,
        a2ui_action_lifecycles: {
          surface_received: {
            surface_id: 'surface_received',
            action_name: 'login',
            status: 'received',
            occurred_at: '2026-08-27T12:00:00Z',
          },
          surface_delivered: {
            surface_id: 'surface_delivered',
            action_name: 'login',
            status: 'delivered',
            occurred_at: '2026-08-27T12:00:00Z',
          },
          surface_consumed: {
            surface_id: 'surface_consumed',
            action_name: 'login',
            status: 'consumed',
            occurred_at: '2026-08-27T12:00:00Z',
          },
          surface_failed: {
            surface_id: 'surface_failed',
            action_name: 'login',
            status: 'failed',
            occurred_at: '2026-08-27T12:00:00Z',
            reason: 'busy turn',
          },
          surface_duplicate: {
            surface_id: 'surface_duplicate',
            action_name: 'login',
            status: 'duplicate',
            occurred_at: '2026-08-27T12:00:00Z',
          },
        },
      },
    }));

    useLiveStore.getState().reconcileSnapshots({ messages: {}, revisions: {} });

    const lifecycles = useLiveStore.getState().entities.a2ui_action_lifecycles;
    expect(lifecycles.surface_received?.status).toBe('unknown');
    expect(lifecycles.surface_delivered?.status).toBe('unknown');
    // Terminal statuses are true regardless of a gap — left alone.
    expect(lifecycles.surface_consumed?.status).toBe('consumed');
    expect(lifecycles.surface_failed?.status).toBe('failed');
    expect(lifecycles.surface_duplicate?.status).toBe('duplicate');
  });

  it('leaves a2ui_action_lifecycles referentially unchanged when every entry is already terminal', () => {
    const terminal = {
      surface_consumed: {
        surface_id: 'surface_consumed',
        action_name: 'login',
        status: 'consumed' as const,
        occurred_at: '2026-08-27T12:00:00Z',
      },
    };
    useLiveStore.setState((state) => ({
      entities: { ...state.entities, a2ui_action_lifecycles: terminal },
    }));

    useLiveStore.getState().reconcileSnapshots({ messages: {}, revisions: {} });

    expect(useLiveStore.getState().entities.a2ui_action_lifecycles).toBe(terminal);
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
