import type { PendingInteraction, Session } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { buildSessionAttentionMap, sessionAttentionLabel } from './session-attention';

const baseSession: Session = {
  id: 'sess_parent',
  workspace_id: 'ws_1',
  title: 'Parent task',
  state: 'running',
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: false,
};

function interaction(kind: PendingInteraction['kind'], id: string): PendingInteraction {
  return {
    id,
    kind,
    owner_session_id: 'sess_child',
    attended_session_id: baseSession.id,
    status: 'pending',
    title: 'Response needed',
    source: { protocol: kind === 'mcp_task_input' ? 'mcp' : 'native' },
    created_at: '2026-09-02T00:00:00Z',
  };
}

describe('session attention', () => {
  it('keeps a stopped child interaction steadily attached to the attended root', () => {
    const child: Session = {
      ...baseSession,
      id: 'sess_child',
      title: 'Evidence specialist',
      parent_session_id: baseSession.id,
      state: 'failed',
    };

    const attentions = buildSessionAttentionMap(
      [baseSession, child],
      [interaction('permission', 'permission:perm_1')],
    );

    expect(attentions[baseSession.id]).toEqual({
      sessionId: baseSession.id,
      permissionIds: ['permission:perm_1'],
      questionIds: [],
      mcpTaskInputIds: [],
      a2uiIds: [],
      unknownIds: [],
      total: 1,
    });
    expect(attentions[child.id]).toBeUndefined();
  });

  it('counts a request kind this build has no surface for on its own, not as a question', () => {
    const attentions = buildSessionAttentionMap(
      [baseSession],
      [
        interaction('question', 'question:q1'),
        // A newer service asked for something this build cannot render. The
        // contract reads it as `unknown`; calling it a question would tell the
        // person to answer a prompt that is never shown.
        interaction('unknown' as PendingInteraction['kind'], 'future:f1'),
      ],
    );

    expect(attentions[baseSession.id]).toMatchObject({
      questionIds: ['question:q1'],
      unknownIds: ['future:f1'],
      total: 2,
    });
    expect(sessionAttentionLabel(attentions[baseSession.id]!)).toBe(
      '1 question and 1 unrecognized request',
    );
  });

  it('projects every interaction kind and ignores resolved rows', () => {
    const interactions = [
      interaction('question', 'question:q1'),
      interaction('permission', 'permission:p1'),
      interaction('mcp_task_input', 'mcp_task_input:q2'),
      interaction('a2ui', 'a2ui:sess_child:surface_1'),
      { ...interaction('question', 'question:old'), status: 'answered' as const },
    ];

    const attention = buildSessionAttentionMap([baseSession], interactions)[baseSession.id]!;

    expect(attention).toMatchObject({
      permissionIds: ['permission:p1'],
      questionIds: ['question:q1'],
      mcpTaskInputIds: ['mcp_task_input:q2'],
      a2uiIds: ['a2ui:sess_child:surface_1'],
      total: 4,
    });
    expect(sessionAttentionLabel(attention)).toBe(
      '1 permission, 1 question, 1 task input and 1 interactive view',
    );
  });

  it('falls back to waiting state only when interaction details are unavailable', () => {
    const waiting: Session = { ...baseSession, state: 'waiting_user' };
    const explicit = buildSessionAttentionMap(
      [waiting],
      [
        {
          ...interaction('question', 'question:q1'),
          owner_session_id: waiting.id,
          attended_session_id: waiting.id,
        },
      ],
    );
    expect(explicit[waiting.id]?.questionIds).toEqual(['question:q1']);

    const fallback = buildSessionAttentionMap([waiting], []);
    expect(fallback[waiting.id]?.questionIds).toEqual([`state:${waiting.id}:waiting_user`]);
  });

  it('counts every child still blocked at a shared root instead of only the first one seen', () => {
    const parent: Session = { ...baseSession };
    const child1: Session = {
      ...baseSession,
      id: 'sess_child_1',
      title: 'Child task 1',
      parent_session_id: parent.id,
      state: 'waiting_permission',
    };
    const child2: Session = {
      ...baseSession,
      id: 'sess_child_2',
      title: 'Child task 2',
      parent_session_id: parent.id,
      state: 'waiting_permission',
    };

    const attentions = buildSessionAttentionMap([parent, child1, child2], []);

    expect(attentions[parent.id]?.permissionIds).toEqual(
      expect.arrayContaining([
        `state:${child1.id}:waiting_permission`,
        `state:${child2.id}:waiting_permission`,
      ]),
    );
    expect(attentions[parent.id]?.total).toBe(2);
  });
});
