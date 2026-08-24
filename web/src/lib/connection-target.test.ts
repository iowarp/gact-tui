import type { Session, Workspace } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  connectionSessionRoute,
  connectionSessionTargetForRoute,
  latestConnectionSessionTarget,
} from './connection-target';

const workspace = (id: string): Workspace => ({
  id,
  name: id,
  display_name: id,
  path: `D:\\work\\${id}`,
  connection_id: 'connection',
  pinned: false,
});

const session = (
  id: string,
  workspaceId: string,
  updatedAt: string,
  lastInteractionAt?: string,
): Session => ({
  id,
  workspace_id: workspaceId,
  title: id,
  state: 'completed',
  created_at: updatedAt,
  updated_at: updatedAt,
  last_interaction_at: lastInteractionAt,
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: false,
});

describe('latestConnectionSessionTarget', () => {
  it('uses interaction time and excludes sessions that do not belong to the connection', () => {
    const target = latestConnectionSessionTarget(
      [workspace('ws valid')],
      [
        session('operationally-new', 'ws valid', '2026-08-23T22:00:00Z', '2026-08-23T18:00:00Z'),
        session('last-used', 'ws valid', '2026-08-23T19:00:00Z', '2026-08-23T20:00:00Z'),
        session('foreign', 'ws missing', '2026-08-23T23:00:00Z'),
      ],
    );

    expect(target?.session.id).toBe('last-used');
    expect(target ? connectionSessionRoute(target) : undefined).toBe(
      '/workspaces/ws%20valid/sessions/last-used',
    );
  });

  it('restores an exact remembered session before considering global recency', () => {
    const target = connectionSessionTargetForRoute(
      '/workspaces/ws%20valid/sessions/remembered',
      [workspace('ws valid')],
      [
        session('newest', 'ws valid', '2026-08-23T22:00:00Z'),
        session('remembered', 'ws valid', '2026-08-23T18:00:00Z'),
      ],
    );

    expect(target?.session.id).toBe('remembered');
  });

  it('rejects remembered routes whose session belongs to another workspace', () => {
    const target = connectionSessionTargetForRoute(
      '/workspaces/ws-one/sessions/foreign',
      [workspace('ws-one'), workspace('ws-two')],
      [session('foreign', 'ws-two', '2026-08-23T22:00:00Z')],
    );

    expect(target).toBeUndefined();
  });
});
