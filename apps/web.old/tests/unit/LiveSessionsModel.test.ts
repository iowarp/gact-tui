import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  humanizeUpdatedAt,
  shouldReconcileTranscriptAfterEvent,
  toSidebarSession,
  workspaceLabel,
} from '../../src/LiveSessionsModel.js';
import type { Session } from '@clio/core';

const BASE_SESSION: Session = {
  id: 's1',
  title: 'EarthScope run',
  status: 'running',
  workspace_id: 'ws_geo',
  parent_session_id: 'parent_1',
  created_at: '2026-06-20T11:00:00.000Z',
  updated_at: '2026-06-20T11:59:00.000Z',
  metadata: { pinned: true, project: 'metadata-project' },
};

afterEach(() => {
  vi.useRealTimers();
});

describe('LiveSessionsModel', () => {
  it('maps backend sessions to sidebar rows', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-20T12:00:00.000Z'));

    expect(toSidebarSession(BASE_SESSION)).toEqual({
      id: 's1',
      title: 'EarthScope run',
      status: 'running',
      project: 'ws_geo',
      updatedAt: '1m',
      metaPinned: true,
      parentId: 'parent_1',
    });
  });

  it('falls back from workspace id to metadata project to generic workspace', () => {
    expect(workspaceLabel({ workspace_id: 'ws_123', metadata: { project: 'meta' } })).toBe(
      'ws_123',
    );
    expect(workspaceLabel({ metadata: { project: 'meta' } })).toBe('meta');
    expect(workspaceLabel({ metadata: { project: 123 } })).toBe('workspace');
    expect(workspaceLabel({ metadata: undefined })).toBe('workspace');
  });

  it('formats relative update times and preserves invalid timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-20T12:00:00.000Z'));

    expect(humanizeUpdatedAt('')).toBe('—');
    expect(humanizeUpdatedAt('not-a-date')).toBe('not-a-date');
    expect(humanizeUpdatedAt('2026-06-20T11:59:45.000Z')).toBe('just now');
    expect(humanizeUpdatedAt('2026-06-20T11:41:00.000Z')).toBe('19m');
    expect(humanizeUpdatedAt('2026-06-20T09:45:00.000Z')).toBe('2h');
    expect(humanizeUpdatedAt('2026-06-17T11:00:00.000Z')).toBe('3d');
  });

  it('reconciles transcript after terminal or destructive events for the active session', () => {
    expect(
      shouldReconcileTranscriptAfterEvent(
        { type: 'message.completed', payload: { session_id: 's1' } },
        's1',
      ),
    ).toBe(true);
    expect(
      shouldReconcileTranscriptAfterEvent(
        { type: 'session.status_changed', payload: { session_id: 's1', status: 'idle' } },
        's1',
      ),
    ).toBe(true);
    expect(
      shouldReconcileTranscriptAfterEvent(
        { type: 'session.status_changed', payload: { session_id: 's1', status: 'running' } },
        's1',
      ),
    ).toBe(false);
    expect(
      shouldReconcileTranscriptAfterEvent(
        { type: 'message.completed', payload: { session_id: 'other' } },
        's1',
      ),
    ).toBe(false);
  });
});
