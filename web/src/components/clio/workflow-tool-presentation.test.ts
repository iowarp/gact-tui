import type { ToolInvocation } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { withWorkflowPresentation, workflowDescriptor } from './workflow-tool-presentation';

const tool: ToolInvocation = {
  id: 'workflow_1',
  session_id: 'session_1',
  name: 'run_workflow',
  title: 'Run Workflow',
  state: 'succeeded',
  input: { request: 'Inventory and verify Alpha and Beta.' },
  output: [
    {
      type: 'text',
      text: JSON.stringify({
        status: 'completed',
        steps: [
          { child: 'inventory', task_id: 'task_inventory' },
          { child: 'verification', task_id: 'task_verification' },
        ],
      }),
    },
  ],
};

describe('workflow tool presentation', () => {
  it('uses the recorded ordered steps as the workflow identity', () => {
    expect(workflowDescriptor(tool)).toEqual({
      label: 'inventory → verification',
      request: 'Inventory and verify Alpha and Beta.',
      status: 'completed',
      steps: [
        { name: 'inventory', taskId: 'task_inventory' },
        { name: 'verification', taskId: 'task_verification' },
      ],
    });
  });

  it('shows recorded ordered provenance without inferring child settlement from a tool call', () => {
    expect(withWorkflowPresentation(tool).presentation).toMatchObject({
      action: 'Run workflow',
      subject: 'workflow-definition',
      summary: '2 ordered steps',
      blocks: [
        { id: 'workflow-definition', type: 'text', label: 'inventory → verification' },
        { id: 'workflow-request', type: 'text', text: 'Inventory and verify Alpha and Beta.' },
      ],
    });
  });

  it('retains a stopped workflow call whose step identities were not returned', () => {
    expect(workflowDescriptor({ ...tool, state: 'cancelled', output: undefined })).toEqual({
      label: 'Workflow',
      request: 'Inventory and verify Alpha and Beta.',
      steps: [],
    });
    expect(
      withWorkflowPresentation({ ...tool, state: 'cancelled', output: undefined }).presentation
        ?.summary,
    ).toBe('Step details unavailable');
  });
});
