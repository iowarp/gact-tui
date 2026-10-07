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
