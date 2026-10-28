import { describe, expect, it } from 'vitest';
import type { ToolInvocation } from './domain.js';
import { toolInvocationSchema } from './schemas.js';
import { isToolExecutionSnapshot, mergeToolInvocation } from './tool-execution.js';

const receipt: ToolInvocation = {
  id: 'call',
  session_id: 'session',
  name: 'fetch',
  state: 'succeeded',
  completed_at: '2026-10-25T05:00:00Z',
  output: { accepted: true, handle: 'task' },
};

function execution(state: 'running' | 'failed' | 'succeeded'): ToolInvocation {
  return {
    ...receipt,
    state,
    output: state === 'failed' ? { error: 'Fetch failed' } : { text: 'Source' },
    ...(state === 'failed' ? { error: 'Fetch failed' } : {}),
    submission: { state: 'succeeded', output: receipt.output },
    execution_task: {
      handle: 'task',
      status: state === 'succeeded' ? 'completed' : state,
      activity: '',
      accepted_at: '2026-10-25T05:00:00Z',
      updated_at: state === 'running' ? '2026-10-25T05:00:01Z' : '2026-10-25T05:00:02Z',
      terminal_at: state === 'running' ? null : '2026-10-25T05:00:02Z',
      cancellation_requested_at: null,
      result_sha256: state === 'running' ? null : 'result-hash',
    },
  };
}

describe('async execution ownership', () => {
  it('retains the failed outcome when its acceptance frame arrives later', () => {
    const result = mergeToolInvocation(execution('failed'), receipt);
    expect(result.state).toBe('failed');
    expect(result.error).toBe('Fetch failed');
    expect(result.output).toEqual({ error: 'Fetch failed' });
    expect(result.submission?.output).toEqual(receipt.output);
  });

  it('lets an authorized execution snapshot supersede a streamed receipt', () => {
    expect(isToolExecutionSnapshot(receipt, execution('failed'))).toBe(true);
    expect(isToolExecutionSnapshot(execution('failed'), receipt)).toBe(false);
  });

  it('rejects a stale running snapshot after a recorded terminal result', () => {
    expect(mergeToolInvocation(execution('failed'), execution('running')).state).toBe('failed');
    expect(isToolExecutionSnapshot(execution('failed'), execution('running'))).toBe(false);
  });

  it('removes stale error and timing fields when a newer owner view omits them', () => {
    const pending = { ...execution('running'), completed_at: undefined, duration_ms: undefined };
    const original = { ...receipt, error: 'Old submission diagnostic' };
    const result = mergeToolInvocation(original, pending);
    expect(result.state).toBe('running');
    expect(result.error).toBeUndefined();
    expect(result.completed_at).toBeUndefined();
  });

  it('preserves explicit contradictory-custody uncertainty instead of an old success', () => {
    const unknown: ToolInvocation = {
      ...receipt,
      state: 'unknown',
      execution_problem: 'ambiguous_execution_custody',
    };
    expect(mergeToolInvocation(execution('succeeded'), unknown).state).toBe('unknown');
    expect(isToolExecutionSnapshot(execution('succeeded'), unknown)).toBe(true);
  });

  it('decodes both phases without fabricating a task relation from JSON', () => {
    expect(toolInvocationSchema.parse(execution('failed')).submission?.state).toBe('succeeded');
    expect(toolInvocationSchema.parse(receipt).execution_task).toBeUndefined();
  });

  it('does not replace a completed submission receipt with a late progress frame', () => {
    const progress: ToolInvocation = {
      id: 'call',
      session_id: 'session',
      name: 'fetch',
      state: 'running',
    };
    expect(mergeToolInvocation(execution('failed'), progress).submission?.output).toEqual(
      receipt.output,
    );
  });
});
