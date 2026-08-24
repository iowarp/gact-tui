import { beforeEach, describe, expect, it } from 'vitest';
import {
  lastWorkspaceRoute,
  rememberWorkspaceRoute,
  returnRouteFromState,
} from './workspace-route-memory';

beforeEach(() => sessionStorage.clear());

describe('connection-scoped workspace route memory', () => {
  it('never reuses a session route from another agent service', () => {
    rememberWorkspaceRoute('http://127.0.0.1:8790', 'ws_luna', 'sess_luna');
    rememberWorkspaceRoute('http://10.0.0.102:8182', 'ws_home', 'sess_home');

    expect(lastWorkspaceRoute('http://127.0.0.1:8790')).toContain('sess_luna');
    expect(lastWorkspaceRoute('http://10.0.0.102:8182')).toContain('sess_home');
    expect(
      returnRouteFromState(
        {
          from: '/workspaces/ws_luna/sessions/sess_luna',
          endpoint: 'http://127.0.0.1:8790',
        },
        'http://10.0.0.102:8182',
      ),
    ).toBe('/workspaces/ws_home/sessions/sess_home');
  });
});
