import { beforeEach, describe, expect, it } from 'vitest';
import {
  lastWorkspaceRoute,
  rememberWorkspaceRoute,
  returnRouteFromState,
  sessionIdFromRoute,
  workspaceIdFromRoute,
} from './workspace-route-memory';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

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

  it('persists the last conversation beyond the current browser session', () => {
    rememberWorkspaceRoute('http://127.0.0.1:8790', 'ws_luna', 'sess_exact');

    sessionStorage.clear();

    expect(lastWorkspaceRoute('http://127.0.0.1:8790')).toBe(
      '/workspaces/ws_luna/sessions/sess_exact',
    );
  });

  it('recovers the workspace context for local settings surfaces', () => {
    expect(workspaceIdFromRoute('/workspaces/ws%20science/sessions/sess_1')).toBe('ws science');
    expect(sessionIdFromRoute('/workspaces/ws%20science/sessions/sess%20review?panel=files')).toBe(
      'sess review',
    );
    expect(workspaceIdFromRoute('/settings/tools')).toBeUndefined();
    expect(sessionIdFromRoute('/settings/schedules')).toBeUndefined();
    expect(workspaceIdFromRoute('/workspaces/%E0%A4%A/sessions/sess_1')).toBeUndefined();
    expect(sessionIdFromRoute('/workspaces/ws_1/sessions/%E0%A4%A')).toBeUndefined();
  });
});
