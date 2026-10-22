import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRequestedFlow } from './use-requested-flow';

describe('flow run deep links', () => {
  it('opens the requested flow run once per handle', () => {
    const open = vi.fn();
    const hook = renderHook(({ handle }) => useRequestedFlow(handle, open), {
      initialProps: { handle: null as string | null },
    });
    expect(open).not.toHaveBeenCalled();
    hook.rerender({ handle: 'task_workflow' });
    hook.rerender({ handle: 'task_workflow' });
    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith('task_workflow');
    hook.rerender({ handle: 'task_council' });
    expect(open).toHaveBeenLastCalledWith('task_council');
  });
});
