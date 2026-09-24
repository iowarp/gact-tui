import { describe, expect, it } from 'vitest';
import { computeA2uiReferencedSessionIds, computeInteractionSessionIds } from './a2ui-session-ids';

describe('computeInteractionSessionIds', () => {
  it('includes a subagent child session (S1 item 4: the child/subagent id must reach the derived set)', () => {
    const ids = computeInteractionSessionIds(
      'sess_root',
      [{ session_id: 'sess_root', child_session_id: 'sess_child' }],
      [],
    );
    expect(ids.has('sess_child')).toBe(true);
    expect(ids.has('sess_root')).toBe(true);
  });

  it('includes a grandchild reached through a chained subagent + session parent_session_id link', () => {
    const ids = computeInteractionSessionIds(
      'sess_root',
      [
        { session_id: 'sess_root', child_session_id: 'sess_child' },
        { session_id: 'sess_child', child_session_id: 'sess_grandchild' },
      ],
      [{ id: 'sess_grandchild', parent_session_id: 'sess_child' }],
    );
    expect(ids.has('sess_child')).toBe(true);
    expect(ids.has('sess_grandchild')).toBe(true);
  });

  it('reaches a descendant discovered only through the sessions list, not a subagent link', () => {
    const ids = computeInteractionSessionIds(
      'sess_root',
      [],
      [{ id: 'sess_branch', parent_session_id: 'sess_root' }],
    );
    expect(ids.has('sess_branch')).toBe(true);
  });

  it('never includes a session unrelated to the closure', () => {
    const ids = computeInteractionSessionIds(
      'sess_root',
      [{ session_id: 'sess_other', child_session_id: 'sess_other_child' }],
      [{ id: 'sess_unrelated', parent_session_id: 'sess_totally_different' }],
    );
    expect(ids.has('sess_other_child')).toBe(false);
    expect(ids.has('sess_unrelated')).toBe(false);
    expect([...ids]).toEqual(['sess_root']);
  });
});

describe('computeA2uiReferencedSessionIds', () => {
  it('unions the open session, owner ids, and the interaction closure, deduped and order-stable', () => {
    const ids = computeA2uiReferencedSessionIds(
      'sess_root',
      ['sess_owner', 'sess_root'],
      new Set(['sess_root', 'sess_child']),
    );
    expect(ids).toEqual(['sess_root', 'sess_owner', 'sess_child']);
  });

  it('includes a session reached only through the subagent/child closure (end-to-end with computeInteractionSessionIds)', () => {
    // S1 item 4: proves the id set `useA2uiSessionRegistry` is actually
    // called with (via `use-workspace-data.ts`) includes a child/subagent
    // session id, using the same two pure functions the real hook composes.
    const interactionIds = computeInteractionSessionIds(
      'sess_root',
      [{ session_id: 'sess_root', child_session_id: 'sess_child' }],
      [],
    );
    const referenced = computeA2uiReferencedSessionIds('sess_root', [], interactionIds);
    expect(referenced).toContain('sess_child');
  });

  it('returns just the open session when there are no owners or interaction descendants', () => {
    expect(computeA2uiReferencedSessionIds('sess_root', [], [])).toEqual(['sess_root']);
  });
});
