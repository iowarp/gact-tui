import type { Session, TaskSnapshot, TranscriptSnapshot, Workspace } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { buildFlowRows } from './runs-page';

const session: Session = {
  id: 'session_root',
  workspace_id: 'workspace_1',
  title: 'Flow session',
  state: 'completed',
  created_at: '2026-10-11T00:00:00Z',
  updated_at: '2026-10-11T00:01:00Z',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: false,
};
const workspace: Workspace = {
  id: 'workspace_1',
  name: 'qualification',
  display_name: 'Qualification',
  path: 'D:\\qualification',
  connection_id: 'local',
  pinned: false,
};

function transcript(tools: TranscriptSnapshot['tools']): TranscriptSnapshot {
  return {
    cursor: '2',
    messages: [],
    tasks: [],
    subagents: [],
    artifacts: [],
    surfaces: [],
    tools,
  };
}

function task(handle: string, status: string, terminal = true): TaskSnapshot {
  return {
    handle,
    kind: 'Subagent',
    owner: {
      human_id: 'human',
      session_id: 'flow_child',
      assignment_id: handle,
      parent_handle: 'root',
    },
    label: 'CLIO',
    description: 'Run the plan',
    description_reference: null,
    description_missing: false,
    tool: 'conversation',
    invocation_id: `flow:${handle}`,
    status,
    raw_status: status,
    activity: terminal ? '' : 'busy',
    progress: { message: '', completed: null, total: null, unit: '', output: null },
    supported_actions: terminal ? [] : ['cancel'],
    cancellation_requested_at: null,
    terminal_at: terminal ? '2026-10-11T00:00:30Z' : null,
    connection_freshness: 'fresh',
    settlement: 'confirmed',
    recording: 'confirmed',
    result: null,
    details: null,
    backend: null,
    created_at: '2026-10-11T00:00:00Z',
    updated_at: '2026-10-11T00:00:30Z',
  };
}

describe('flow run indexing', () => {
  it('indexes accepted flow starts with their task state and deep-link handle', () => {
    const rows = buildFlowRows(
      [
        transcript([
          {
            id: 'call_workflow',
            session_id: 'session_root',
            name: 'run_workflow',
            state: 'succeeded',
            output: {
              result: {
                accepted: true,
                handle: 'task_workflow',
                kind: 'Subagent',
                flow: 'workflow',
              },
            },
          },
          {
            id: 'call_council',
            session_id: 'session_root',
            name: 'run_flow',
            state: 'succeeded',
            input: { kwargs: { flow: 'council', input: 'Which language?' } },
            output: [
              {
                type: 'text',
                text: '{"accepted": true, "handle": "task_council", "flow": "council"}',
              },
            ],
          },
          { id: 'call_wait', session_id: 'session_root', name: 'wait_tasks', state: 'succeeded' },
        ]),
      ],
      [session],
      [workspace],
      [task('task_workflow', 'failed'), task('task_council', 'running', false)],
    );
    expect(rows).toEqual([
      expect.objectContaining({
        label: 'Workflow run',
        source: 'flow',
        placement: 'workflow',
        state: 'failed',
        flowHandle: 'task_workflow',
        workspaceId: 'workspace_1',
        targetSessionId: 'session_root',
      }),
      expect.objectContaining({
        label: 'Council run',
        placement: 'council',
        state: 'running',
        flowHandle: 'task_council',
        cancellable: true,
      }),
    ]);
  });

  it('reports a refused start and an unloaded task status instead of guessing', () => {
    const rows = buildFlowRows(
      [
        transcript([
          {
            id: 'call_refused',
            session_id: 'session_root',
            name: 'run_workflow',
            state: 'succeeded',
            output: {
              accepted: false,
              reason: 'workflow_invalid',
              error: 'step b waits on missing a',
            },
          },
          {
            id: 'call_unloaded',
            session_id: 'session_root',
            name: 'run_flow',
            state: 'succeeded',
            output: { accepted: true, handle: 'task_unknown', flow: 'arena' },
          },
        ]),
      ],
      [session],
      [workspace],
    );
    expect(rows[0]).toMatchObject({
      state: 'failed',
      reportedStatus: 'workflow_invalid',
      statusReason: 'step b waits on missing a',
      flowHandle: undefined,
    });
    expect(rows[1]).toMatchObject({
      label: 'Arena run',
      state: 'unknown',
      statusReason: 'The flow task status is not loaded.',
    });
  });
});
