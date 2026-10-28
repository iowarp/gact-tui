import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AsyncProcess } from '@clio/core/v3';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  asyncProcessesPage: vi.fn(),
  sessionAgentTasks: vi.fn(),
  sessionDiffs: vi.fn().mockResolvedValue([]),
  contextFiles: vi.fn().mockResolvedValue([]),
  contextFrames: vi.fn().mockResolvedValue([]),
}));
vi.mock('./use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://service' } }),
}));
import { useSessionObservability } from './use-session-observability';
import { AsyncTaskList, TaskPageContinuation } from '@/components/clio/async-task-list';

afterEach(cleanup);

it('warms only the first bounded history page and shares it when the rail opens', async () => {
  repository.asyncProcessesPage.mockReset().mockImplementation(async (_id, options) => ({
    items: options.activeOnly ? [] : [{ handle: 'finished-child' }],
    cursor: options.activeOnly ? null : 'another-page',
    total: null,
    revision: 1,
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result, unmount } = renderHook(
    () => useSessionObservability('sess', { warmHistory: true }),
    { wrapper },
  );
  try {
    await waitFor(() => expect(result.current.workPages.history.items).toHaveLength(1));
    expect(result.current.workPages.history.visible).toBe(false);
    expect(repository.asyncProcessesPage).toHaveBeenCalledWith(
      'sess',
      {
        cursor: undefined,
        activeOnly: false,
        includeDescendants: false,
        limit: 25,
      },
      expect.any(AbortSignal),
    );
    expect(repository.asyncProcessesPage).toHaveBeenCalledTimes(2);
    act(() => result.current.workPages.history.toggle());
    expect(result.current.workPages.history.visible).toBe(true);
    expect(repository.asyncProcessesPage).toHaveBeenCalledTimes(2);
    expect(result.current.workPages.history.hasMore).toBe(true);
  } finally {
    unmount();
    client.clear();
  }
});

it('uses one bounded active-work read and retains empty-page continuation', async () => {
  repository.asyncProcessesPage
    .mockReset()
    .mockResolvedValueOnce({ items: [], cursor: 'next', total: null, revision: 1 })
    .mockResolvedValueOnce({
      items: [{ handle: 'child-handle' }],
      cursor: null,
      total: null,
      revision: 2,
    });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result, unmount } = renderHook(() => useSessionObservability('sess'), { wrapper });
  try {
    await waitFor(() => expect(result.current.processes.isSuccess).toBe(true));
    expect(result.current.processes.hasNextPage).toBe(true);
    expect(repository.asyncProcessesPage).toHaveBeenCalledTimes(1);
    expect(repository.asyncProcessesPage).toHaveBeenLastCalledWith(
      'sess',
      { cursor: undefined, activeOnly: true, includeDescendants: false },
      expect.any(AbortSignal),
    );
    await act(async () => {
      await result.current.workPages.loadMore();
    });
    await waitFor(() =>
      expect(result.current.processes.data?.pages.flatMap((page) => page.items)).toEqual([
        { handle: 'child-handle' },
      ]),
    );
    expect(result.current.processes.hasNextPage).toBe(false);
    expect(repository.asyncProcessesPage).toHaveBeenCalledTimes(2);
    expect(repository.asyncProcessesPage).toHaveBeenLastCalledWith(
      'sess',
      { cursor: 'next', activeOnly: true, includeDescendants: false },
      expect.any(AbortSignal),
    );
    expect(repository.sessionAgentTasks).not.toHaveBeenCalled();
  } finally {
    unmount();
    client.clear();
  }
});

it('keeps current work visible independently of fifty historical rows and offers restart on demand', async () => {
  const completed: AsyncProcess = {
    id: 'completed-worker',
    handle: 'task_completed',
    kind: 'agent',
    task_kind: 'Subagent',
    title: 'Completed analysis',
    description: 'Inspect the retained original assignment',
    status: 'completed',
    live_state: 'completed',
    effective_status: 'completed',
    supported_actions: ['restart'],
    metadata: {},
  };
  const running: AsyncProcess = {
    ...completed,
    id: 'current-worker',
    handle: 'task_current',
    title: 'Current analysis',
    status: 'running',
    live_state: 'running',
    effective_status: 'running',
    supported_actions: ['cancel'],
  };
  const old = Array.from({ length: 50 }, (_, index) => ({
    ...completed,
    id: `old-${index}`,
    handle: `task_old_${index}`,
    title: `Old analysis ${index}`,
  }));
  repository.asyncProcessesPage.mockReset().mockImplementation(async (_sid, options) => ({
    items: options.activeOnly ? [running] : options.cursor ? [completed] : old,
    cursor: !options.activeOnly && !options.cursor ? 'later-history' : null,
    total: options.activeOnly ? 1 : 1005,
    revision: 1,
  }));
  const control = vi.fn(async () => {});
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Evidence() {
    const { processes, workPages } = useSessionObservability('sess');
    return (
      <AsyncTaskList
        processes={processes.data?.pages.flatMap((page) => page.items) ?? []}
        onControlTask={control}
        pagination={workPages}
      />
    );
  }
  const view = render(
    <QueryClientProvider client={client}>
      <Evidence />
    </QueryClientProvider>,
  );
  try {
    expect(await screen.findByText('Current analysis')).toBeVisible();
    expect(repository.asyncProcessesPage).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Completed work' }));
    expect(await screen.findByText('Old analysis 49')).toBeVisible();
    expect(screen.getByText('Current analysis')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Load more completed work' }));
    fireEvent.keyDown(await screen.findByLabelText('More actions for Completed analysis'), {
      key: 'Enter',
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Restart subagent' }));
    expect(control).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent(completed.title);
    fireEvent.click(screen.getByRole('button', { name: 'Restart subagent' }));
    await waitFor(() => expect(control).toHaveBeenCalledWith(completed, 'restart'));
    expect(control).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Current analysis')).toBeVisible();
  } finally {
    view.unmount();
    client.clear();
  }
});

it('shows a real next-page query failure, retains loaded work and allows retry', async () => {
  repository.asyncProcessesPage
    .mockReset()
    .mockResolvedValueOnce({
      items: [{ handle: 'first', title: 'Loaded work' }],
      cursor: 'next',
      total: null,
      revision: 1,
    })
    .mockRejectedValueOnce(new Error('Next page unavailable'))
    .mockResolvedValueOnce({
      items: [{ handle: 'second', title: 'Additional work' }],
      cursor: null,
      total: null,
      revision: 2,
    });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function WorkPage() {
    const { processes, workPages } = useSessionObservability('sess');
    return (
      <>
        {processes.data?.pages
          .flatMap((page) => page.items)
          .map((task) => <p key={task.handle}>{task.title}</p>)}
        <TaskPageContinuation pagination={workPages} />
      </>
    );
  }
  const { unmount } = render(
    <QueryClientProvider client={client}>
      <WorkPage />
    </QueryClientProvider>,
  );
  try {
    expect(await screen.findByText('Loaded work')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Load more work' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Next page unavailable');
    expect(screen.getByText('Loaded work')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Load more work' }));
    expect(await screen.findByText('Additional work')).toBeVisible();
    expect(screen.getByText('Loaded work')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(repository.asyncProcessesPage).toHaveBeenCalledTimes(3);
  } finally {
    unmount();
    client.clear();
  }
});
