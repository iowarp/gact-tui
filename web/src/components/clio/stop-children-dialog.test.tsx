import type { StopScopeTask } from '@clio/core/v3';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StopChildrenDialog } from './stop-children-dialog';

const repository = vi.hoisted(() => ({ stopScope: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

const { useStopWithChildren } = await import('@/hooks/use-stop-with-children');

const flow: StopScopeTask = {
  handle: 'task_flow',
  kind: 'Subagent',
  label: 'deep-research flow',
  description: 'Which HDF5 filter IDs are registered for ZFP and SZ3?',
  status: 'active',
  activity: 'busy',
  session_id: 'sess_child',
  created_at: '2026-11-14T00:00:00Z',
};

function dialog(overrides: Partial<Parameters<typeof StopChildrenDialog>[0]> = {}) {
  const props = {
    tasks: [
      flow,
      {
        ...flow,
        handle: 'task_q',
        kind: 'Question',
        label: 'Approve plan',
        status: 'input_required',
      },
    ],
    open: true,
    pending: false,
    onStopAll: vi.fn(),
    onStopReply: vi.fn(),
    onOpenChange: vi.fn(),
    ...overrides,
  };
  render(<StopChildrenDialog {...props} />);
  return props;
}

describe('StopChildrenDialog', () => {
  it('names each open task with its kind and status in words', () => {
    dialog();
    const list = screen.getByRole('list', { name: 'Open tasks' });
    expect(list).toHaveTextContent('deep-research flow');
    expect(list).toHaveTextContent('Agent');
    expect(list).toHaveTextContent('Running');
    expect(list).toHaveTextContent('Question');
    expect(list).toHaveTextContent('Waiting for input');
    expect(screen.getByText(/started 2 tasks that are still open/)).toBeInTheDocument();
  });

  it('offers stopping everything or the reply only', () => {
    const props = dialog();
    fireEvent.click(screen.getByRole('button', { name: 'Stop everything' }));
    expect(props.onStopAll).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Stop reply only' }));
    expect(props.onStopReply).toHaveBeenCalledOnce();
  });
});

describe('useStopWithChildren', () => {
  it('stops the reply at once when nothing is open', async () => {
    repository.stopScope.mockResolvedValueOnce({ session_id: 's', open_children: [] });
    const cancel = { mutate: vi.fn(), isPending: false };
    const { result } = renderHook(() => useStopWithChildren('s', cancel));
    await act(() => result.current.request());
    expect(cancel.mutate).toHaveBeenCalledWith('keep');
    expect(result.current.dialog.open).toBe(false);
  });

  it('asks when work is open, and sends the choice', async () => {
    repository.stopScope.mockResolvedValueOnce({ session_id: 's', open_children: [flow] });
    const cancel = { mutate: vi.fn(), isPending: false };
    const { result } = renderHook(() => useStopWithChildren('s', cancel));
    await act(() => result.current.request());
    await waitFor(() => expect(result.current.dialog.open).toBe(true));
    expect(cancel.mutate).not.toHaveBeenCalled();
    act(() => result.current.dialog.onStopAll());
    expect(cancel.mutate).toHaveBeenCalledWith('stop');
    expect(result.current.dialog.open).toBe(false);
  });

  it('stops the reply only when the open work cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    repository.stopScope.mockRejectedValueOnce(new Error('404'));
    const cancel = { mutate: vi.fn(), isPending: false };
    const { result } = renderHook(() => useStopWithChildren('s', cancel));
    await act(() => result.current.request());
    expect(cancel.mutate).toHaveBeenCalledWith('keep');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
