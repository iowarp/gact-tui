import type { AsyncProcess } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';

const repository = vi.hoisted(() => ({ cancelTasks: vi.fn(), controlSubagent: vi.fn() }));
vi.mock('./use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://localhost:8790' } }),
}));
import { useSubagentControl } from './use-subagent-control';
import { useTaskCancellation } from './use-task-cancellation';

beforeEach(() => {
  repository.cancelTasks.mockReset().mockResolvedValue(undefined);
  repository.controlSubagent.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

it.each(['cancel', 'pause', 'resume', 'restart'] as const)(
  '%s refreshes the shared task pages and owning observability only',
  async (action) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const keys = [
      queryKeys.key('tasks', 'http://localhost:8790', 'first-page'),
      queryKeys.key('tasks', 'http://localhost:8790', 'next-page'),
      queryKeys.sessionObservability('http://localhost:8790', 'owner'),
      queryKeys.key('tasks', 'http://other-service:8790', 'first-page'),
    ];
    for (const key of keys) client.setQueryData(key, { retained: true });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(
      () => ({ cancel: useTaskCancellation('owner'), control: useSubagentControl('owner') }),
      { wrapper },
    );
    const task: AsyncProcess = {
      handle: 'original-handle',
      id: 'display-id',
      kind: 'agent',
      title: 'Child',
      live_state: 'running',
      status: 'running',
      metadata: {},
    };
    try {
      await act(async () => {
        if (action === 'cancel') await result.current.cancel(task);
        else await result.current.control(task, action);
      });
      if (action === 'cancel') {
        expect(repository.cancelTasks).toHaveBeenCalledTimes(1);
        expect(repository.cancelTasks).toHaveBeenCalledWith('owner', ['original-handle']);
        expect(repository.controlSubagent).not.toHaveBeenCalled();
      } else {
        expect(repository.controlSubagent).toHaveBeenCalledTimes(1);
        expect(repository.controlSubagent).toHaveBeenCalledWith('owner', 'original-handle', action);
        expect(repository.cancelTasks).not.toHaveBeenCalled();
      }
      expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([
        true,
        true,
        true,
        false,
      ]);
    } finally {
      unmount();
      client.clear();
    }
  },
);
