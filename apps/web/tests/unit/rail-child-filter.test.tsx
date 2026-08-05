/**
 * Rail child-session filter (W2, NDP showcase): sessions with a
 * parent_session_id are children — they render inside their parent's
 * transcript as Call boxes, never as top-level rail rows. Live repro: the
 * NDP session's rail showed "5 agents" (geospatial/ndp/analysis/visualization
 * task children as independent sessions).
 */
import { describe, expect, it } from 'vitest';
import type { Session, Workspace } from '@clio/core';
import { groupByWorkspace } from '../../src/session/SessionView';

const ws: Workspace[] = [{ id: 'ws1', name: 'ndp' } as Workspace];

function session(over: Partial<Session>): Session {
  return { id: 'sess', title: 't', status: 'idle', workspace_id: 'ws1', ...over } as Session;
}

describe('groupByWorkspace child filtering', () => {
  it('excludes sessions that carry a parent_session_id from rail rows', () => {
    const groups = groupByWorkspace(
      [
        session({ id: 'parent', title: 'EarthScope NDP' }),
        session({ id: 'child1', title: 'geospatial task', parent_session_id: 'parent' }),
        session({ id: 'child2', title: 'ndp task', parent_session_id: 'parent' }),
      ],
      ws,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sessions.map((s) => s.id)).toEqual(['parent']);
    expect(groups[0]!.count).toBe(1);
  });

  it('keeps top-level sessions untouched', () => {
    const groups = groupByWorkspace([session({ id: 'a' }), session({ id: 'b' })], ws);
    expect(groups[0]!.sessions).toHaveLength(2);
  });
});
