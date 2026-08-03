import type { PermissionRequest, Session } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import type { SidebarSession } from '../../src/components/Sidebar.js';
import { applyLiveSessionEvent, type SessionEventSink } from '../../src/LiveSessionEvents.js';
import type { BackendNotification } from '../../src/LiveNotifications.js';

function makeSink(initial: SidebarSession[] = []) {
  const patches: Array<{ id: string; patch: Partial<SidebarSession> }> = [];
  let rows = initial;
  const apply = <T,>(cur: T, next: T | ((prev: T) => T)): T =>
    typeof next === 'function' ? (next as (prev: T) => T)(cur) : next;
  const refetch = vi.fn();
  const onTitleChanged = vi.fn();
  const sink: SessionEventSink = {
    patch: (id, patch) => {
      patches.push({ id, patch });
    },
    setRaw: (next) => {
      rows = apply(rows, next);
    },
    refetch,
    onTitleChanged,
  };
  return {
    sink,
    patches,
    refetch,
    onTitleChanged,
    get rows() {
      return rows;
    },
  };
}

function makeHooks(sink?: SessionEventSink) {
  let pendingPermission: PermissionRequest | null = { id: 'perm_1' } as PermissionRequest;
  const notifications: BackendNotification[] = [];
  return {
    hooks: {
      setPendingPermission: (next: PermissionRequest | null) => {
        pendingPermission = next;
      },
      sessionEvents: sink,
      onNotification: (notification: BackendNotification) => {
        notifications.push(notification);
      },
      now: () => 123,
    },
    get pendingPermission() {
      return pendingPermission;
    },
    notifications,
  };
}

describe('LiveSessionEvents', () => {
  it('patches status changes and clears permissions only for settled statuses', () => {
    const sessionEvents = makeSink();
    const h = makeHooks(sessionEvents.sink);

    expect(
      applyLiveSessionEvent(
        'session.status_changed',
        { session_id: 's1', status: 'running' },
        h.hooks,
      ),
    ).toBe(true);
    expect(h.pendingPermission?.id).toBe('perm_1');
    expect(sessionEvents.patches).toEqual([
      { id: 's1', patch: { status: 'running', bumpedAt: 123 } },
    ]);

    applyLiveSessionEvent(
      'session.status_changed',
      { session_id: 's1', status: 'idle' },
      h.hooks,
    );
    expect(h.pendingPermission).toBeNull();
  });

  it('adds new sessions once and deletes sessions by id', () => {
    const existing: SidebarSession = {
      id: 's0',
      title: 'Existing',
      status: 'idle',
      project: 'workspace',
      updatedAt: 'now',
    };
    const sessionEvents = makeSink([existing]);
    const h = makeHooks(sessionEvents.sink);
    const session: Session = {
      id: 's1',
      title: 'New run',
      status: 'running',
      workspace_id: 'ws_geo',
      created_at: '2026-06-20T11:00:00.000Z',
      updated_at: '2026-06-20T12:00:00.000Z',
    };

    applyLiveSessionEvent('session.created', { session }, h.hooks);
    applyLiveSessionEvent('session.created', { session }, h.hooks);
    expect(sessionEvents.rows.map((row) => row.id)).toEqual(['s1', 's0']);

    applyLiveSessionEvent('session.deleted', { session_id: 's1' }, h.hooks);
    expect(sessionEvents.rows.map((row) => row.id)).toEqual(['s0']);
  });

  it('patches session updates and emits title-change side effects', () => {
    const sessionEvents = makeSink();
    const h = makeHooks(sessionEvents.sink);

    applyLiveSessionEvent(
      'session.updated',
      { session_id: 'abcdefghijk', changed_fields: ['title'] },
      h.hooks,
    );

    expect(sessionEvents.patches).toEqual([
      { id: 'abcdefghijk', patch: { updatedAt: 'just now', bumpedAt: 123 } },
    ]);
    expect(sessionEvents.refetch).toHaveBeenCalledOnce();
    expect(sessionEvents.onTitleChanged).toHaveBeenCalledWith('abcdefghijk');
    expect(h.notifications).toEqual([
      {
        level: 'info',
        title: 'Session renamed',
        body: 'Backend updated the title of session abcdefgh.',
      },
    ]);
  });

  it('returns false for non-session events', () => {
    expect(applyLiveSessionEvent('message.completed', {}, makeHooks().hooks)).toBe(false);
  });

  // Regression for iowarp/gact-tui#225: clio publishes session.updated with the
  // FULL Session object (`id`, no `session_id`, no `changed_fields`). The reducer
  // must treat that payload as the update instead of dropping it.
  it('applies clio full-Session session.updated payloads and detects renames (#225)', () => {
    const existing: SidebarSession = {
      id: 'sess_abc123456',
      title: 'Old title',
      status: 'idle',
      project: 'ws_geo',
      updatedAt: '5m',
    };
    const sessionEvents = makeSink([existing]);
    const h = makeHooks(sessionEvents.sink);

    const payload = {
      id: 'sess_abc123456',
      title: 'Renamed by backend',
      status: 'running',
      workspace_id: 'ws_geo',
      created_at: '2026-06-20T11:00:00.000Z',
      updated_at: '2026-06-30T12:00:00.000Z',
      mode: 'plan',
    };

    expect(applyLiveSessionEvent('session.updated', payload, h.hooks)).toBe(true);

    const row = sessionEvents.rows.find((r) => r.id === 'sess_abc123456');
    expect(row?.title).toBe('Renamed by backend');
    expect(row?.status).toBe('running');
    expect(row?.updatedAt).toBe('just now');
    expect(row?.bumpedAt).toBe(123);
    // Title changed relative to the current row → rename side effects fire.
    expect(sessionEvents.onTitleChanged).toHaveBeenCalledWith('sess_abc123456');
    expect(h.notifications).toEqual([
      {
        level: 'info',
        title: 'Session renamed',
        body: 'Backend updated the title of session sess_abc.',
      },
    ]);
  });

  it('applies clio full-Session updates without rename side effects when the title is unchanged (#225)', () => {
    const existing: SidebarSession = {
      id: 'sess_abc123456',
      title: 'Same title',
      status: 'idle',
      project: 'ws_geo',
      updatedAt: '5m',
    };
    const sessionEvents = makeSink([existing]);
    const h = makeHooks(sessionEvents.sink);

    applyLiveSessionEvent(
      'session.updated',
      {
        id: 'sess_abc123456',
        title: 'Same title',
        status: 'idle',
        workspace_id: 'ws_geo',
        created_at: '2026-06-20T11:00:00.000Z',
        updated_at: '2026-06-30T12:00:00.000Z',
        mode: 'auto',
      },
      h.hooks,
    );

    const row = sessionEvents.rows.find((r) => r.id === 'sess_abc123456');
    expect(row?.updatedAt).toBe('just now');
    expect(row?.bumpedAt).toBe(123);
    expect(sessionEvents.onTitleChanged).not.toHaveBeenCalled();
    expect(sessionEvents.refetch).not.toHaveBeenCalled();
    expect(h.notifications).toEqual([]);
  });
});
