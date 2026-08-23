import type { Session } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { visibleWorkspaceSessions } from './recent-sessions';

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
  it('keeps the active session and limits the default list to recent work', () => {
    const sessions = Array.from({ length: 30 }, (_, index) =>
      session(
        `sess_${index}`,
        `Run ${index}`,
        `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
      ),
    );

    const visible = visibleWorkspaceSessions(sessions, 'ws_1', 'sess_0', '');

    expect(visible).toHaveLength(8);
    expect(visible[0]?.id).toBe('sess_0');
    expect(visible.some((row) => row.id === 'sess_29')).toBe(true);
  });

  it('searches titles without exposing the unbounded session history', () => {
    const sessions = [
      session('spotter', 'Working SPOTTER campaign', '2026-08-22T00:00:00Z'),
      session('probe', 'lm-probe-spotter', '2026-08-21T00:00:00Z'),
    ];

    expect(visibleWorkspaceSessions(sessions, 'ws_1', '', 'working')).toEqual([sessions[0]]);
  });
});
