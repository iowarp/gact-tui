import type { ToolInvocation } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { flowLabel, flowToolDescriptor } from './flow-tool-presentation';

function tool(name: string, input: unknown, output: unknown): ToolInvocation {
  return { id: 'call', session_id: 's', name, state: 'succeeded', input, output };
}

describe('flowToolDescriptor', () => {
  it('reads the accepted handle of run_flow and run_plan, wherever the result nests it', () => {
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
      flowToolDescriptor(tool('run_plan', {}, { result: { accepted: true, handle: 'task_p' } })),
    ).toMatchObject({ flow: 'plan', label: 'Plan', handle: 'task_p' });
  });

  it('reports a refused start and ignores other tools', () => {
    expect(
      flowToolDescriptor(
        tool('run_plan', {}, { accepted: false, reason: 'plan_invalid', error: 'cycle' }),
      ),
    ).toMatchObject({ handle: undefined, refusal: { reason: 'plan_invalid', message: 'cycle' } });
    expect(flowToolDescriptor(tool('wait_tasks', {}, {}))).toBeUndefined();
    expect(flowLabel('deep_review')).toBe('Deep review');
  });
});
