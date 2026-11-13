import type { TransportFrame } from '@clio/core/v3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  dispatchMcpAppClosedFrame,
  MCP_APP_CLOSED_EVENT,
  noteMcpApp,
  useMcpAppLiveSetStore,
} from './mcp-app-live-set';

const target = {
  label: 'Render view',
  appInstanceId: 'app_1',
  dataRef: 'ref_1',
  sessionId: 'sess_1',
  resourceUri: 'ui://viz/view',
  sourceServer: 'viz',
  toolName: 'viz_open',
};

function frame(payload: Record<string, unknown>, eventName = MCP_APP_CLOSED_EVENT): TransportFrame {
  return {
    cursor: '1',
    eventName,
    receivedAt: '2026-11-13T00:00:00Z',
    data: {
      protocol_version: '0.3',
      type: eventName,
      occurred_at: '2026-11-13T00:00:00Z',
      scope: { connection_id: 'local', session_id: 'sess_1' },
      payload,
    },
  };
}

afterEach(() => {
  useMcpAppLiveSetStore.setState({ apps: {}, latest: {} });
});

describe('mcp_app_closed', () => {
  it('marks an App the server closed as ended, so its card offers Reopen', () => {
    noteMcpApp(target, undefined, 'tab');
    dispatchMcpAppClosedFrame(
      frame({ session_id: 'sess_1', app_instance_id: 'app_1', reason: 'server_stopped' }),
    );
    expect(useMcpAppLiveSetStore.getState().apps.app_1).toMatchObject({
      placement: 'ended',
      gone: true,
    });
  });

  it('ignores other events, unknown Apps and malformed payloads', () => {
    noteMcpApp(target, undefined);
    dispatchMcpAppClosedFrame(frame({ app_instance_id: 'app_1' }, 'mcp_app_tool_call'));
    dispatchMcpAppClosedFrame(frame({ app_instance_id: 'app_other' }));
    dispatchMcpAppClosedFrame(frame({ app_instance_id: 7 }));
    expect(useMcpAppLiveSetStore.getState().apps.app_1?.placement).toBe('inline');
    expect(useMcpAppLiveSetStore.getState().apps.app_other).toBeUndefined();
  });
});
