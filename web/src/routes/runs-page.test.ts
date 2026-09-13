import type { Session, TranscriptSnapshot, Workspace } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { buildWorkflowRows } from './runs-page';

describe('workflow run indexing', () => {
  it('indexes only recorded workflows and preserves their canvas deep-link identity', () => {
    const session: Session = {
      id: 'session_root',
      workspace_id: 'workspace_1',
      title: 'Workflow session',
      state: 'completed',
      created_at: '2026-09-11T00:00:00Z',
      updated_at: '2026-09-11T00:01:00Z',
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
    const transcript: TranscriptSnapshot = {
      cursor: '2',
      messages: [],
      tasks: [],
      subagents: [],
      artifacts: [],
      surfaces: [],
      tools: [
        {
          id: 'call_workflow',
          session_id: 'session_root',
          name: 'run_workflow',
          state: 'succeeded',
          duration_ms: 30_000,
          completed_at: '2026-09-11T00:00:30Z',
          output: {
            steps: [
              { child: 'inventory', task_id: 'task_inventory' },
              { child: 'verification', task_id: 'task_verification' },
            ],
          },
        },
        {
          id: 'call_wait',
          session_id: 'session_root',
          name: 'wait_agent_tasks',
          state: 'succeeded',
        },
      ],
    };

    expect(buildWorkflowRows([transcript], [session], [workspace])).toEqual([
      expect.objectContaining({
        label: 'inventory → verification',
        source: 'workflow',
        state: 'completed',
        taskId: 'call_workflow',
        targetSessionId: 'session_root',
        updatedAt: '2026-09-11T00:00:30Z',
        workspaceId: 'workspace_1',
        workflow: expect.objectContaining({ id: 'call_workflow' }),
      }),
    ]);
  });
});
