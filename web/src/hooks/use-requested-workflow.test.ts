import type { ToolInvocation } from '@clio/core/v3';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRequestedWorkflow } from './use-requested-workflow';

describe('workflow deep links', () => {
  it('waits for a recorded workflow and opens it once', () => {
    const open = vi.fn();
    const workflow = { id: 'w', name: 'run_workflow' } as ToolInvocation;
    const hook = renderHook(({ tools }) => useRequestedWorkflow('w', tools, open), {
      initialProps: { tools: [] as ToolInvocation[] },
    });
    expect(open).not.toHaveBeenCalled();
    hook.rerender({ tools: [workflow] });
    hook.rerender({ tools: [{ ...workflow }] });
    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith(workflow);
  });

  it('does not open another kind of tool with the requested ID', () => {
    const open = vi.fn();
    renderHook(() =>
      useRequestedWorkflow('w', [{ id: 'w', name: 'shell' } as ToolInvocation], open),
    );
    expect(open).not.toHaveBeenCalled();
  });
});
