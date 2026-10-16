import type { Session, TaskSnapshot, TranscriptSnapshot, Workspace } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { buildWorkflowRows } from './runs-page';

describe('workflow run indexing', () => {
  it('preserves a recorded failure and distinguishes unlaunched steps from unavailable task views', () => {
    const transcript: TranscriptSnapshot = {
      cursor: 'failed',
      messages: [],
      tasks: [],
      subagents: [],
      artifacts: [],
      surfaces: [],
      tools: [
        {
          id: 'workflow-failed',
          session_id: 'session-root',
          name: 'run_workflow',
          state: 'succeeded',
          output: {
            status: 'workflow_child_failed',
            failed_step: 'inventory-step',
            steps: [
              {
                step_id: 'inventory-step',
                child: 'inventory',
                task_id: 'failed-child',
                launch_state: 'accepted',
              },
              {
                step_id: 'verify-step',
                child: 'verification',
                task_id: null,
                launch_state: 'not_launched',
              },
            ],
          },
        },
      ],
    };
    expect(buildWorkflowRows([transcript], [], [])[0]).toMatchObject({
      state: 'failed',
      reportedStatus: 'workflow_child_failed',
      statusReason: 'Workflow failed at inventory. 1 step was not launched.',
      progress: { completed: null, total: 2, unit: 'steps' },
    });
    const uncertain = {
      ...transcript,
      tools: transcript.tools.map((tool) => ({
        ...tool,
        output: {
          status: 'task_state_uncertain',
          steps: [
            {
              step_id: 'inventory-step',
              child: 'inventory',
              task_id: 'unknown-child',
              launch_state: 'accepted',
            },
          ],
        },
      })),
    };
    expect(buildWorkflowRows([uncertain], [], [])[0]).toMatchObject({
      state: 'task_state_uncertain',
      statusReason: 'Accepted step statuses are not loaded.',
    });
  });

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

    const completed = (handle: string): TaskSnapshot => ({
      handle,
      kind: 'Subagent',
      owner: {
        human_id: 'human',
        session_id: 'child',
        assignment_id: handle,
        parent_handle: 'root',
      },
      label: 'Step',
      description: 'Original assignment',
      description_reference: null,
      description_missing: false,
      tool: 'conversation',
      invocation_id: handle,
      status: 'completed',
      raw_status: 'completed',
      activity: '',
      progress: { message: '', completed: null, total: null, unit: '', output: null },
      supported_actions: [],
      cancellation_requested_at: null,
      terminal_at: '2026-09-11T00:00:30Z',
      connection_freshness: 'fresh',
      settlement: 'confirmed',
      recording: 'confirmed',
      result: null,
      details: null,
      backend: null,
      created_at: '2026-09-11T00:00:00Z',
      updated_at: '2026-09-11T00:00:30Z',
    });
    const tasks = [completed('task_inventory'), completed('task_verification')];
    expect(buildWorkflowRows([transcript], [session], [workspace], tasks)).toEqual([
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
    expect(buildWorkflowRows([transcript], [session], [workspace])[0]).toMatchObject({
      state: 'unknown',
    });
    const stopped = {
      ...transcript,
      tools: transcript.tools.map((tool) => ({ ...tool, state: 'cancelled' as const })),
    };
    const active = tasks.map((task) => ({
      ...task,
      status: 'active',
      raw_status: 'working',
      terminal_at: null,
    }));
    expect(buildWorkflowRows([stopped], [session], [workspace], active)[0]).toMatchObject({
      state: 'running',
    });
    for (const status of ['workflow_predicate_unsatisfied', 'workflow_step_stalled', undefined]) {
      const unfinished = {
        ...transcript,
        tools: transcript.tools
          .filter((tool) => tool.name === 'run_workflow')
          .map((tool) => ({
            ...tool,
            output: {
              status,
              steps: [
                { child: 'inventory', task_id: 'task_inventory', launch_state: 'accepted' },
                { child: 'verification', task_id: null, launch_state: 'not_started' },
              ],
            },
          })),
      };
      expect(buildWorkflowRows([unfinished], [session], [workspace], [tasks[0]])[0]).toMatchObject({
        state: 'yielded',
        statusReason: 'The declared workflow has an uncompleted step.',
        progress: { completed: 1, total: 2, unit: 'steps' },
      });
    }
  });
});
