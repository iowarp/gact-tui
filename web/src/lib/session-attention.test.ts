import type { ApprovalRequest, Session, UserQuestion } from '@clio/core/v3';
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

describe('session attention', () => {
  it('bubbles child-session blockers to the primary parent task', () => {
    const child: Session = {
      ...baseSession,
      id: 'sess_child',
      title: 'Child task',
      parent_session_id: baseSession.id,
      state: 'waiting_permission',
    };
    const approval = {
      id: 'perm_1',
      session_id: child.id,
      tool_name: 'shell.exec',
      summary: 'Run protected command',
      status: 'pending',
      created_at: '2026-09-01T00:00:00Z',
    } satisfies ApprovalRequest;

    const attentions = buildSessionAttentionMap([baseSession, child], [approval], []);

    expect(attentions[baseSession.id]).toEqual({
      sessionId: baseSession.id,
      permissionIds: ['perm_1'],
      questionIds: [],
      total: 1,
    });
    expect(attentions[child.id]).toBeUndefined();
  });

  it('uses explicit interactions and falls back to waiting state when details are unavailable', () => {
    const waiting: Session = { ...baseSession, state: 'waiting_user' };
    const question = {
      id: 'question_1',
      session_id: waiting.id,
      prompt: 'Choose an evidence view',
      status: 'pending',
      kind: 'choice',
      options: [],
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    } satisfies UserQuestion;

    const explicit = buildSessionAttentionMap([waiting], [], [question]);
    expect(explicit[waiting.id]?.questionIds).toEqual(['question_1']);
    expect(sessionAttentionLabel(explicit[waiting.id]!)).toBe('1 question');

    const fallback = buildSessionAttentionMap([waiting], [], []);
    expect(fallback[waiting.id]?.questionIds).toEqual([`state:${waiting.id}:waiting_user`]);
  });
});
