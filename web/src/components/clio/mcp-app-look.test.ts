import type { TransportFrame } from '@clio/core/v3';
import { describe, expect, it, vi } from 'vitest';
import { dispatchMcpAppLookFrame, McpAppLooks, snapshotAnswer } from './mcp-app-look';

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
});
