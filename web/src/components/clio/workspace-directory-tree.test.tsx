import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceDirectoryTree } from './workspace-directory-tree';

const files = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => ({ workspaceFiles: files }) }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://local', token: '' } }),
}));
vi.mock('@/providers/appearance-provider', () => ({
  useAppearancePreferences: () => ({ hideDotFiles: true }),
}));
afterEach(() => {
  cleanup();
  files.mockReset();
  vi.restoreAllMocks();
});

it('opens the explicitly requested directory in its owning workspace', async () => {
  files.mockResolvedValue({
    entries: [{ path: 'reports/result.md', type: 'file', internal: false }],
    truncated: false,
    next_offset: null,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WorkspaceDirectoryTree
        workspaceId="other_workspace"
        directory="reports"
        root={{
          entries: [{ path: 'wrong-root.txt', type: 'file', internal: false }],
          truncated: false,
          next_offset: null,
        }}
        onSelect={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('treeitem', { name: 'result.md' })).toBeVisible();
  expect(screen.queryByText('wrong-root.txt')).not.toBeInTheDocument();
  expect(files).toHaveBeenCalledWith('other_workspace', expect.any(AbortSignal), {
    directory: 'reports',
    offset: 0,
    includeHidden: false,
  });
});

it('shows a folder access failure without pretending it granted access', async () => {
  files.mockRejectedValue(new Error('Folder is outside the permitted roots'));
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WorkspaceDirectoryTree workspaceId="workspace" directory="private" onSelect={vi.fn()} />
    </QueryClientProvider>,
  );
  // The row names the failure; the server's reason is its hover detail.
  const failure = await screen.findByText("Couldn't list this folder");
  expect(failure).toBeVisible();
  expect(failure).toHaveAttribute('title', 'Folder is outside the permitted roots');
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  expect(files).toHaveBeenCalledTimes(1);
});

it('loads only an expanded directory and unmounts it when collapsed', async () => {
  files.mockResolvedValue({
    entries: [{ path: 'analysis/curve.csv', type: 'file', internal: false }],
    truncated: false,
    next_offset: null,
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WorkspaceDirectoryTree
        workspaceId="workspace"
        root={{
          entries: [{ path: 'analysis', type: 'dir', internal: false }],
          truncated: false,
          next_offset: null,
        }}
        onSelect={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(files).not.toHaveBeenCalled();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Expand folder analysis' }));
  expect(await screen.findByRole('treeitem', { name: 'curve.csv' })).toBeVisible();
  expect(files).toHaveBeenCalledWith('workspace', expect.any(AbortSignal), {
    directory: 'analysis',
    offset: 0,
    includeHidden: false,
  });
  await user.click(screen.getByRole('button', { name: 'Collapse folder analysis' }));
  expect(screen.queryByRole('treeitem', { name: 'curve.csv' })).not.toBeInTheDocument();
});

it('loads the next page in the current folder without replacing its first page', async () => {
  files.mockResolvedValue({
    entries: [{ path: 'second.csv', type: 'file', internal: false }],
    truncated: false,
    next_offset: null,
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WorkspaceDirectoryTree
        workspaceId="workspace"
        root={{
          entries: [{ path: 'first.csv', type: 'file', internal: false }],
          truncated: true,
          next_offset: 200,
        }}
        onSelect={vi.fn()}
      />
    </QueryClientProvider>,
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Load more files' }));
  expect(await screen.findByRole('treeitem', { name: 'second.csv' })).toBeVisible();
  expect(screen.getByRole('treeitem', { name: 'first.csv' })).toBeVisible();
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Load more files' })).not.toBeInTheDocument(),
  );
  expect(files).toHaveBeenCalledWith('workspace', expect.any(AbortSignal), {
    directory: '',
    offset: 200,
    includeHidden: false,
  });
});

it('shows a loading status, not bare text, while a folder loads', async () => {
  files.mockReturnValue(new Promise(() => undefined));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WorkspaceDirectoryTree
        workspaceId="workspace"
        root={{
          entries: [{ path: 'analysis', type: 'dir', internal: false }],
          truncated: false,
          next_offset: null,
        }}
        onSelect={vi.fn()}
      />
    </QueryClientProvider>,
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Expand folder analysis' }));
  expect(await screen.findByRole('status', { name: 'Loading folder' })).toBeInTheDocument();
  expect(screen.queryByText('Loading folder…')).not.toBeInTheDocument();
});

it('marks files this conversation changed in a paged folder', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WorkspaceDirectoryTree
        workspaceId="workspace"
        changedPaths={new Set(['run.py'])}
        root={{
          entries: [
            { path: 'run.py', type: 'file', internal: false },
            { path: 'notes.md', type: 'file', internal: false },
          ],
          truncated: true,
          next_offset: 2,
        }}
        onSelect={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(
    screen.getByRole('treeitem', { name: 'run.py, changed in this conversation' }),
  ).toHaveAttribute('data-changed');
  expect(screen.getByRole('treeitem', { name: 'notes.md' })).not.toHaveAttribute('data-changed');
});

it('mounts only the rows in view when a paged folder holds thousands of files', () => {
  // jsdom has no layout: give the scroll viewport a 600 px window.
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.slot === 'scroll-area-viewport' ? 600 : 0;
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <div data-slot="scroll-area-viewport">
        <WorkspaceDirectoryTree
          workspaceId="workspace"
          root={{
            entries: Array.from({ length: 5000 }, (_, index) => ({
              path: `sample-${String(index).padStart(5, '0')}.csv`,
              type: 'file' as const,
              internal: false,
            })),
            truncated: true,
            next_offset: 5000,
          }}
          onSelect={vi.fn()}
        />
      </div>
    </QueryClientProvider>,
  );
  const rows = screen.getAllByRole('treeitem');
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.length).toBeLessThan(100);
  // 5,000 files plus the "Load more files" row.
  expect(screen.getByRole('tree').style.height).toBe(`${5001 * 28}px`);
});
