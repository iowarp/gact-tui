import { PROTOCOL_VERSION, type TransportFrame } from '@clio/core/v3';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import {
  LiveSourceRefresher,
  latestArtifactSource,
  liveSourceChangeForFrame,
} from './live-source-updates';

const ENDPOINT = 'http://gact.test';
const CLOCK = { request: () => 0, cancel: () => undefined };

function frame(eventName: string, payload: Record<string, unknown>): TransportFrame {
  return {
    eventName,
    data: {
      protocol_version: PROTOCOL_VERSION,
      type: eventName,
      occurred_at: '2026-11-05T10:00:00Z',
      scope: { connection_id: 'conn_1', session_id: 'sess_root' },
      payload,
    },
  } as TransportFrame;
}

function versionAdded(workspaceId: string, name: string): TransportFrame {
  return frame('semantic.event', {
    event_type: 'artifact.version.added',
    subject: { artifact_id: 'artifact_v2', name, workspace_id: workspaceId },
    payload: {},
  });
}

function reference(uri: string) {
  return queryKeys.key('a2ui-reference', ENDPOINT, 'sess_root', uri);
}

describe('live sources', () => {
  it('reads the workspace and name of a named artifact at its latest version only', () => {
    expect(latestArtifactSource('artifact://ws_lab/status.csv@latest')).toEqual({
      workspaceId: 'ws_lab',
      name: 'status.csv',
    });
    expect(latestArtifactSource('artifact://ws_lab/my%20run.csv@latest')?.name).toBe('my run.csv');
    expect(latestArtifactSource('artifact://ws_lab/status.csv@v2')).toBeUndefined();
    expect(latestArtifactSource('artifact://artifact_abc')).toBeUndefined();
  });

  it('reads the change an artifact version event or a study record event names', () => {
    expect(liveSourceChangeForFrame(versionAdded('ws_lab', 'status.csv'))).toEqual({
      kind: 'artifact',
      workspaceId: 'ws_lab',
      name: 'status.csv',
    });
    expect(
      liveSourceChangeForFrame(frame('science.record', { study: 'e_1', view: 'board' })),
    ).toEqual({ kind: 'records', study: 'e_1', view: 'board' });
    expect(
      liveSourceChangeForFrame(frame('semantic.event', { event_type: 'tool.completed' })),
    ).toBeUndefined();
  });

  it('re-reads the live sources a change names, and never a fixed one', () => {
    // SABOTAGE: invalidate every `a2ui-reference` query in the commit and the pinned
    // and other-name resolutions go stale too.
    const client = new QueryClient();
    const live = reference('artifact://ws_lab/status.csv@latest');
    const pinned = reference('artifact://ws_lab/status.csv@v1');
    const otherName = reference('artifact://ws_lab/other.csv@latest');
    const board = [...queryKeys.key('study-source', ENDPOINT, 'e_1', 'records/board'), '{}'];
    const measurements = [...queryKeys.key('study-source', ENDPOINT, 'e_1', 'measurements'), '{}'];
    const artifacts = queryKeys.sessionArtifacts(ENDPOINT, 'sess_root');
    for (const key of [live, pinned, otherName, board, measurements, artifacts])
      client.setQueryData(key, { ok: true });
    const refresher = new LiveSourceRefresher(client, ENDPOINT, 'sess_root', CLOCK);

    refresher.push(versionAdded('ws_lab', 'status.csv'));
    refresher.push(frame('science.record', { study: 'e_1', view: 'board' }));
    refresher.stop({ flush: true });

    const stale = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated;
    expect(stale(live)).toBe(true);
    expect(stale(artifacts)).toBe(true);
    expect(stale(board)).toBe(true);
    expect(stale(pinned)).toBe(false);
    expect(stale(otherName)).toBe(false);
    expect(stale(measurements)).toBe(false);
  });

  it('re-reads a stream on its update, once per frame, and no other stream', () => {
    // SABOTAGE: drop the `stream.updated` case in `liveSourceChangeForFrame` and the
    // stream's rows stay cached.
    const client = new QueryClient();
    const kiln = [...queryKeys.key('stream-rows', ENDPOINT, 'stream_kiln'), '{}'];
    const other = [...queryKeys.key('stream-rows', ENDPOINT, 'stream_other'), '{}'];
    client.setQueryData(kiln, { ok: true });
    client.setQueryData(other, { ok: true });
    const refresher = new LiveSourceRefresher(client, ENDPOINT, 'sess_root', CLOCK);
    for (let n = 0; n < 5; n += 1)
      refresher.push(frame('stream.updated', { stream_id: 'stream_kiln', writes: n }));
    refresher.stop({ flush: true });
    expect(client.getQueryState(kiln)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
  });
});
