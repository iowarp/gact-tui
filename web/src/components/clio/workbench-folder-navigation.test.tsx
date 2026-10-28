import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ClioWorkbench, type ClioWorkbenchHandle } from './workbench';
import { useLiveStore } from '@/store/live-store';

const repository = vi.hoisted(() => ({ workspaceFiles: vi.fn(), readWorkspaceFile: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://folder-review' } }),
}));
vi.mock('@/providers/appearance-provider', () => ({
  useAppearancePreferences: () => ({ hideDotFiles: false }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
  useLiveStore.getState().reset();
});

it.each(['workspace_1', 'workspace_other'])(
  'opens a folder in its owning workspace %s and returns to that root',
  async (owner) => {
    repository.workspaceFiles.mockImplementation(async (_workspace, _signal, options) => ({
      entries: options.directory
        ? [{ path: 'reports/result.md', type: 'file', internal: false }]
        : [{ path: 'reports', type: 'dir', internal: false }],
      truncated: false,
      next_offset: null,
    }));
    const handle = createRef<ClioWorkbenchHandle>();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
      >
        <ClioWorkbench
          ref={handle}
          workspaceId="workspace_1"
          sessionId=""
          files={[{ path: 'wrong-root.txt', type: 'file', internal: false }]}
          artifacts={[]}
          diffs={[]}
          onUndoDiff={vi.fn()}
          onOpenSubagent={vi.fn()}
          sessionView={<p>Session</p>}
        />
      </QueryClientProvider>,
    );
    await act(async () =>
      handle.current?.open({ kind: 'workspace-folder', path: 'reports', workspaceId: owner }),
    );
    expect(await screen.findByRole('treeitem', { name: 'result.md' })).toBeVisible();
    expect(screen.queryByText('wrong-root.txt')).not.toBeInTheDocument();
    expect(repository.workspaceFiles).toHaveBeenCalledWith(
      owner,
      expect.any(AbortSignal),
      expect.objectContaining({ directory: 'reports' }),
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'All folders' }));
    expect(await screen.findByRole('button', { name: 'Expand folder reports' })).toBeVisible();
    expect(repository.workspaceFiles).toHaveBeenCalledWith(
      owner,
      expect.any(AbortSignal),
      expect.objectContaining({ directory: '' }),
    );
  },
);

it.each([false, true])(
  'reads a URL-form Windows citation through its workspace identity (restored=%s)',
  async (restored) => {
    const workspaceId = 'workspace_1';
    const path = '/D:/Work/participant-survey.csv';
    useLiveStore
      .getState()
      .replaceSnapshots({
        workspaces: {
          [workspaceId]: {
            id: workspaceId,
            name: 'Work',
            display_name: 'Work',
            path: 'D:\\Work',
            connection_id: 'local',
            pinned: false,
          },
        },
      });
    repository.readWorkspaceFile.mockResolvedValue('participant,level\nP01,none\n');
    if (restored)
      window.localStorage.setItem(
        'clio.workbench-tabs.v1:workspace_1',
        JSON.stringify({
          tabs: [
            {
              id: 'old-citation',
              kind: 'workspace-file',
              label: 'participant-survey.csv',
              path,
              workspaceId,
            },
          ],
          activeTabId: 'old-citation',
        }),
      );
    const handle = createRef<ClioWorkbenchHandle>();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
      >
        <ClioWorkbench
          ref={handle}
          workspaceId={workspaceId}
          sessionId=""
          files={[{ path: 'participant-survey.csv', type: 'file', internal: false }]}
          artifacts={[]}
          diffs={[]}
          onUndoDiff={vi.fn()}
          onOpenSubagent={vi.fn()}
          sessionView={<p>Session</p>}
        />
      </QueryClientProvider>,
    );
    if (!restored) await act(async () => handle.current?.open({ kind: 'workspace-file', path }));
    expect(await screen.findByText('P01')).toBeVisible();
    expect(repository.readWorkspaceFile).toHaveBeenCalledWith(
      workspaceId,
      'participant-survey.csv',
      expect.any(AbortSignal),
    );
    expect(repository.readWorkspaceFile).not.toHaveBeenCalledWith(
      workspaceId,
      path,
      expect.any(AbortSignal),
    );
  },
);
