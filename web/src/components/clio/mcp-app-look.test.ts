import type { TransportFrame } from '@clio/core/v3';
import { describe, expect, it, vi } from 'vitest';
import { markMcpAppEnded, noteMcpApp, resetMcpAppLiveSet } from './mcp-app-live-set';
import {
  dispatchMcpAppLookFrame,
  HOLDER_RENEW_MS,
  McpAppLooks,
  SNAPSHOT_ANSWER_MS,
  snapshotAnswer,
} from './mcp-app-look';

const identity = { sessionId: 's1', appInstanceId: 'app1', dataRef: 'ref' };
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function frame(payload: Record<string, unknown>): TransportFrame {
  return {
    cursor: '1',
    eventName: 'mcp_app_look',
    receivedAt: '2026-11-13T00:00:00Z',
    data: {
      protocol_version: '0.3',
      type: 'mcp_app_look',
      occurred_at: '2026-11-13T00:00:00Z',
      scope: { connection_id: 'local', session_id: 's1' },
      payload,
    },
  };
}

describe('snapshotAnswer', () => {
  it('keeps a snapshot and types every refusal', () => {
    const snapshot = snapshotAnswer({
      image: PNG,
      width: 800,
      height: 600,
      scale: 2,
      painted: { canvas: 1 },
      skipped: [{ what: 'canvas', reason: 'webgl_frame_not_redrawn' }],
    });
    expect(snapshot).toMatchObject({ width: 800, scale: 2, painted: { canvas: 1 } });
    expect(snapshotAnswer({ error: { reason: 'view_not_readable', message: 'x' } })).toEqual({
      error: { reason: 'view_not_readable', message: 'x' },
    });
    expect(snapshotAnswer({ image: 'data:text/plain,x' })).toMatchObject({
      error: { reason: 'snapshot_failed' },
    });
  });
});

describe('McpAppLooks', () => {
  it('holds the view, answers a look with a snapshot, and lets it go', async () => {
    const setMcpAppShown = vi.fn().mockResolvedValue({});
    const postMcpAppLook = vi.fn().mockResolvedValue({});
    const snapshot = vi.fn().mockResolvedValue({
      image: PNG,
      width: 10,
      height: 10,
      scale: 1,
      painted: {},
      skipped: [],
    });
    const looks = new McpAppLooks({ setMcpAppShown, postMcpAppLook }, identity, snapshot);
    looks.start();
    expect(setMcpAppShown).toHaveBeenCalledWith(identity, expect.any(String), true);

    const envelope = frame({
      session_id: 's1',
      app_instance_id: 'app1',
      call_id: 'c1',
      max_side: 900,
    });
    dispatchMcpAppLookFrame(envelope);
    dispatchMcpAppLookFrame(envelope); // one answer per call
    await vi.waitFor(() => expect(postMcpAppLook).toHaveBeenCalledTimes(1));
    expect(snapshot).toHaveBeenCalledWith(expect.objectContaining({ maxSide: 900 }));
    expect(postMcpAppLook.mock.calls[0]![1]).toBe('c1');

    looks.stop();
    expect(setMcpAppShown).toHaveBeenLastCalledWith(identity, expect.any(String), false);
    dispatchMcpAppLookFrame(
      frame({ session_id: 's1', app_instance_id: 'app1', call_id: 'c2', max_side: 900 }),
    );
    await Promise.resolve();
    expect(postMcpAppLook).toHaveBeenCalledTimes(1);
  });

  it('does not let go of a view CLIO already closed', () => {
    resetMcpAppLiveSet();
    const setMcpAppShown = vi.fn().mockResolvedValue({});
    const looks = new McpAppLooks({ setMcpAppShown }, identity, vi.fn());
    looks.start();
    noteMcpApp(
      {
        ...identity,
        label: 'Plot',
        resourceUri: 'ui://plot',
        sourceServer: 'plots',
        toolName: 'plot',
      },
      undefined,
      'tab',
    );
    markMcpAppEnded(identity.appInstanceId);
    looks.stop();
    expect(setMcpAppShown).toHaveBeenCalledTimes(1);
    expect(setMcpAppShown).toHaveBeenCalledWith(identity, expect.any(String), true);
    resetMcpAppLiveSet();
  });

  it('answers a failed snapshot with its reason', async () => {
    const postMcpAppLook = vi.fn().mockResolvedValue({});
    const looks = new McpAppLooks(
      { setMcpAppShown: vi.fn().mockResolvedValue({}), postMcpAppLook },
      identity,
      () => Promise.reject(new Error('The interactive view closed.')),
    );
    looks.start();
    dispatchMcpAppLookFrame(
      frame({ session_id: 's1', app_instance_id: 'app1', call_id: 'c3', max_side: 900 }),
    );
    await vi.waitFor(() => expect(postMcpAppLook).toHaveBeenCalled());
    expect(postMcpAppLook.mock.calls[0]![2]).toEqual({
      error: { reason: 'snapshot_failed', message: 'The interactive view closed.' },
    });
    looks.stop();
  });

  it('answers a look whose frame never replies, typed, instead of holding the turn', async () => {
    vi.useFakeTimers();
    try {
      const postMcpAppLook = vi.fn().mockResolvedValue({});
      const looks = new McpAppLooks(
        { setMcpAppShown: vi.fn().mockResolvedValue({}), postMcpAppLook },
        identity,
        () => new Promise(() => undefined),
      );
      looks.start();
      dispatchMcpAppLookFrame(
        frame({ session_id: 's1', app_instance_id: 'app1', call_id: 'c4', max_side: 900 }),
      );
      await vi.advanceTimersByTimeAsync(SNAPSHOT_ANSWER_MS - 1);
      expect(postMcpAppLook).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(postMcpAppLook.mock.calls[0]![2]).toMatchObject({
        error: { reason: 'snapshot_unanswered' },
      });
      looks.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers from the mount the person can see, else the newest', async () => {
    const seen = vi.fn().mockResolvedValue({ image: PNG });
    const hidden = vi.fn().mockResolvedValue({ image: PNG });
    const client = {
      setMcpAppShown: vi.fn().mockResolvedValue({}),
      postMcpAppLook: vi.fn().mockResolvedValue({}),
    };
    let shown = true;
    const older = new McpAppLooks(client, identity, seen, () => shown);
    const newer = new McpAppLooks(client, identity, hidden, () => false);
    older.start();
    newer.start();
    dispatchMcpAppLookFrame(
      frame({ session_id: 's1', app_instance_id: 'app1', call_id: 'c5', max_side: 900 }),
    );
    await vi.waitFor(() => expect(seen).toHaveBeenCalledTimes(1));
    expect(hidden).not.toHaveBeenCalled();
    shown = false;
    dispatchMcpAppLookFrame(
      frame({ session_id: 's1', app_instance_id: 'app1', call_id: 'c6', max_side: 900 }),
    );
    await vi.waitFor(() => expect(hidden).toHaveBeenCalledTimes(1));
    older.stop();
    newer.stop();
  });

  it('renews its claim on the view while mounted, and stops when it unloads', async () => {
    vi.useFakeTimers();
    try {
      const setMcpAppShown = vi.fn().mockResolvedValue({});
      const looks = new McpAppLooks(
        { setMcpAppShown, postMcpAppLook: vi.fn().mockResolvedValue({}) },
        identity,
        () => Promise.resolve(snapshotAnswer({ image: PNG })),
      );
      looks.start();
      expect(setMcpAppShown).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(HOLDER_RENEW_MS * 2);
      expect(setMcpAppShown).toHaveBeenCalledTimes(3);
      expect(setMcpAppShown.mock.calls.every((call) => call[2] === true)).toBe(true);
      looks.stop();
      const after = setMcpAppShown.mock.calls.length;
      await vi.advanceTimersByTimeAsync(HOLDER_RENEW_MS * 2);
      expect(setMcpAppShown).toHaveBeenCalledTimes(after);
    } finally {
      vi.useRealTimers();
    }
  });
});
