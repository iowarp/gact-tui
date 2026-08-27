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
