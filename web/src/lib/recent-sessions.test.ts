import type { Session } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  isPrimarySession,
  sessionInteractionAt,
  visibleWorkspaceSessions,
} from './recent-sessions';

const session = (id: string, title: string, updated_at: string): Session => ({
  id,
  workspace_id: 'ws_1',
  title,
  state: 'completed',
  created_at: updated_at,
  updated_at,
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: false,
});

describe('visibleWorkspaceSessions', () => {
  it('keeps recent order stable instead of moving the active session', () => {
    const sessions = Array.from({ length: 30 }, (_, index) =>
      session(
        `sess_${index}`,
        `Run ${index}`,
        `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
      ),
    );

    const visible = visibleWorkspaceSessions(sessions, 'ws_1', '');

    expect(visible).toHaveLength(8);
    expect(visible[0]?.id).toBe('sess_29');
    expect(visible.some((row) => row.id === 'sess_29')).toBe(true);
  });

  it('searches titles without exposing the unbounded session history', () => {
    const sessions = [
      session('spotter', 'Working SPOTTER campaign', '2026-08-22T00:00:00Z'),
      session('probe', 'lm-probe-spotter', '2026-08-21T00:00:00Z'),
    ];

    expect(visibleWorkspaceSessions(sessions, 'ws_1', 'working')).toEqual([sessions[0]]);
  });

  it('keeps child-agent sessions out of primary workspace navigation', () => {
    const parent = session('parent', 'NDP Demo', '2026-08-24T00:00:00Z');
    const child = {
      ...session('child', 'geospatial task', '2026-08-24T00:01:00Z'),
      parent_session_id: parent.id,
    };

    expect(isPrimarySession(parent)).toBe(true);
    expect(isPrimarySession(child)).toBe(false);
    expect(visibleWorkspaceSessions([child, parent], 'ws_1', '')).toEqual([parent]);
  });

  it('orders and labels by interaction time rather than operational updates', () => {
    const row = {
      ...session('sess_interaction', 'Recovered', '2026-08-23T21:57:00Z'),
      last_interaction_at: '2026-08-23T18:21:00Z',
    };

    expect(sessionInteractionAt(row)).toBe('2026-08-23T18:21:00Z');
  });
});
