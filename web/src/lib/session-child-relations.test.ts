import type { AsyncProcess, Message, Session, SubagentRun } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { sessionChildRelations } from './session-child-relations';

const parentId = 'sess_parent';
const child: Session = {
  id: 'sess_child',
  workspace_id: 'ws_1',
  title: 'Forensic watcher',
  state: 'completed',
  created_at: '2026-08-21T12:18:53Z',
  updated_at: '2026-08-21T12:37:00Z',
  last_interaction_at: '2026-08-21T12:36:49Z',
  parent_session_id: parentId,
  agent_id: 'watcher',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: false,
};

describe('session child relations', () => {
  it('restores an omitted authoritative child across conversation and observability', () => {
    const relation = sessionChildRelations({
      messages: [],
      parentSessionId: parentId,
      processes: [],
      sessions: [child],
      subagents: [],
    });

    expect(relation.subagents).toEqual([
      expect.objectContaining({
        id: 'session-child:sess_child',
        child_session_id: 'sess_child',
        title: 'Forensic watcher',
      }),
    ]);
    expect(relation.messages[0]).toMatchObject({
      role: 'system',
      created_at: child.created_at,
      blocks: [{ type: 'subagent', subagent_id: 'session-child:sess_child' }],
    });
    expect(relation.processes[0]).toMatchObject({
      kind: 'agent',
      created_at: child.created_at,
      updated_at: child.last_interaction_at,
      metadata: { source: 'session_relationship' },
    });
  });

  it('does not duplicate transcript or process relationships already reported by the service', () => {
    const subagent: SubagentRun = {
      id: 'subagent_real',
      session_id: parentId,
      child_session_id: child.id,
      title: child.title,
      state: child.state,
    };
    const messages: Message[] = [
      {
        id: 'message_1',
        session_id: parentId,
        role: 'assistant',
        created_at: child.created_at,
        blocks: [{ id: 'block_1', type: 'subagent', subagent_id: subagent.id }],
      },
    ];
    const processes: AsyncProcess[] = [
      {
        kind: 'agent',
        id: 'process_1',
        title: child.title,
        live_state: child.state,
        status: child.state,
        child_session_id: child.id,
        metadata: {},
      },
    ];

    expect(
      sessionChildRelations({ messages, parentSessionId: parentId, processes, sessions: [child], subagents: [subagent] }),
    ).toEqual({ messages, processes, subagents: [subagent] });
  });
});
