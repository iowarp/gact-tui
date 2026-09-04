import type { Session, Workspace } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  connectionSessionRoute,
  connectionSessionTargetForRoute,
  connectionWorkspaceForRoute,
  emptyConnectionSessionTarget,
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
  it('reuses only an empty primary base-agent session for the entry composer', () => {
    const populated = {
      ...session('populated', 'ws valid', '2026-08-23T22:00:00Z'),
      message_count: 2,
    };
    const specialist = {
      ...session('specialist', 'ws valid', '2026-08-23T23:00:00Z'),
      active_blueprint_id: 'factorio-flat',
      message_count: 0,
    };
    const preflight = {
      ...session('preflight', 'ws valid', '2026-08-23T23:30:00Z'),
      title: '__CLIO dev ARC preflight__',
      message_count: 0,
    };
    const empty = { ...session('empty', 'ws valid', '2026-08-23T21:00:00Z'), message_count: 0 };

    expect(
      emptyConnectionSessionTarget(workspace('ws valid'), [populated, specialist, preflight, empty])
        ?.session.id,
    ).toBe('empty');
  });

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

  it('keeps the remembered workspace when the session that route named is gone', () => {
    // The connection page reopens into a fresh conversation, so a workspace the
    // person was working in must survive the loss of one conversation in it.
    expect(
      connectionWorkspaceForRoute('/workspaces/ws%20valid/sessions/deleted', [
        workspace('ws valid'),
      ])?.id,
    ).toBe('ws valid');
    expect(
      connectionWorkspaceForRoute('/workspaces/ws-gone/sessions/any', [workspace('ws valid')]),
    ).toBeUndefined();
    expect(
      connectionWorkspaceForRoute('/settings/appearance', [workspace('ws valid')]),
    ).toBeUndefined();
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
