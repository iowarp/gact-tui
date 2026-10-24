import type { ToolInvocation } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { flowLabel, flowToolDescriptor } from './flow-tool-presentation';

function tool(name: string, input: unknown, output: unknown): ToolInvocation {
  return { id: 'call', session_id: 's', name, state: 'succeeded', input, output };
}

describe('flowToolDescriptor', () => {
  it('reads the accepted handle of run_flow and run_workflow, wherever the result nests it', () => {
    expect(
      flowToolDescriptor(
        tool('run_flow', { kwargs: { flow: 'council' } }, [
          { type: 'text', text: '{"accepted": true, "handle": "task_c", "flow": "council"}' },
        ]),
      ),
    ).toEqual({
      flow: 'council',
      label: 'Council',
      handle: 'task_c',
      refusal: undefined,
      args: { flow: 'council' },
    });
    expect(
      flowToolDescriptor(
        tool('run_workflow', {}, { result: { accepted: true, handle: 'task_w' } }),
      ),
    ).toMatchObject({ flow: 'workflow', label: 'Workflow', handle: 'task_w' });
  });

  it('reports a refused start and ignores other tools', () => {
    expect(
      flowToolDescriptor(
        tool('run_workflow', {}, { accepted: false, reason: 'workflow_invalid', error: 'cycle' }),
      ),
    ).toMatchObject({
      handle: undefined,
      refusal: { reason: 'workflow_invalid', message: 'cycle' },
    });
    expect(
      flowToolDescriptor(
        tool(
          'run_workflow',
          {},
          { accepted: false, reason: 'flow_not_trusted', step: 'debate', error: 'not trusted' },
        ),
      )?.refusal,
    ).toEqual({ reason: 'flow_not_trusted', message: 'not trusted', step: 'debate' });
    expect(flowToolDescriptor(tool('wait_tasks', {}, {}))).toBeUndefined();
    expect(flowLabel('deep_review')).toBe('Deep review');
  });
});
