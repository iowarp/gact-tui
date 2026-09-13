import type { Session, SubagentRun } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { withSubagentOrigins } from './subagent-origins';

const child: SubagentRun = {
  id: 'task_1',
  session_id: 'session_parent',
  child_session_id: 'session_child',
  agent_id: 'verification',
  title: 'Check whether Alpha plus Beta equals 11...',
  state: 'completed',
};

const session = {
  id: 'session_child',
  workspace_id: 'workspace_1',
  title: 'verification task',
  state: 'completed',
  created_at: '2026-09-10T00:00:00Z',
  updated_at: '2026-09-10T00:01:00Z',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: false,
  metadata: {
    pending_spawn: {
      mode: 'async',
      seed_context: '# Skill: delegate-qualification-check\n\nCheck only supplied facts.',
    },
  },
} satisfies Session;

describe('withSubagentOrigins', () => {
  it('preserves a child skill name and async mode from its session record', () => {
    expect(withSubagentOrigins([child], [session])).toEqual([
      {
        ...child,
        origin: { kind: 'skill', name: 'delegate-qualification-check', mode: 'async' },
      },
    ]);
  });

  it('does not invent an origin when the child session has no skill declaration', () => {
    expect(withSubagentOrigins([child], [{ ...session, metadata: undefined }])).toEqual([child]);
  });
});
