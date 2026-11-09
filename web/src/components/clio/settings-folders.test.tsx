import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  workspaces: vi.fn(),
  updateWorkspace: vi.fn(),
  grantWorkspaceFolder: vi.fn(),
  revokeWorkspaceFolder: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));

import { TooltipProvider } from '@/components/ui/tooltip';
import { FoldersSettings } from './settings-folders';

const primaryPath = 'D:\\science\\campaigns\\flat-NDP';
const workspace = (extra: string[] = ['D:\\data\\earthscope-raw']) => ({
  id: 'ws_flat_ndp',
  name: 'flat-NDP',
  display_name: 'flat-NDP',
  path: primaryPath,
  connection_id: 'fixture',
  source_folders: [
    { path: primaryPath, name: 'flat-NDP', primary: true },
    ...extra.map((path) => ({ path, name: path.split('\\').at(-1)!, primary: false })),
  ],
});

async function renderSection(initialWorkspaceId = 'ws_flat_ndp') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <FoldersSettings initialWorkspaceId={initialWorkspaceId} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  repository.workspaces.mockResolvedValue([workspace()]);
  repository.updateWorkspace.mockImplementation(async () => workspace());
  repository.grantWorkspaceFolder.mockResolvedValue({});
  repository.revokeWorkspaceFolder.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('folders settings', { timeout: 20_000 }, () => {
  it('shows the workspace name, its primary folder and additional folders with words', async () => {
    await renderSection();

    expect(await screen.findByLabelText('Name')).toHaveValue('flat-NDP');
    const primary = screen.getByRole('group', { name: 'Primary folder' });
    expect(within(primary).getByText('Workspace folder')).toBeVisible();
    expect(within(primary).getByText(primaryPath)).toBeVisible();
    const additional = screen.getByRole('group', { name: 'Additional folders' });
    expect(within(additional).getByText('earthscope-raw')).toBeVisible();
    expect(within(additional).getByText('Read and write')).toBeVisible();
    expect(screen.getByText(/Running tools pick up folder changes/)).toBeVisible();
  });

  it('stages a rename, colour and icon and saves them together', async () => {
    const user = userEvent.setup();
    await renderSection();

    const name = await screen.findByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'flat-NDP 2026');
    await user.click(screen.getByRole('radio', { name: 'Blue' }));
    expect(screen.getByText('2 changes')).toBeVisible();

    await user.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() =>
      expect(repository.updateWorkspace).toHaveBeenCalledWith('ws_flat_ndp', {
        name: 'flat-NDP 2026',
      }),
    );
    expect(JSON.parse(window.localStorage.getItem('clio.workspace-appearance.v1')!)).toEqual({
      'http://127.0.0.1 ws_flat_ndp': { colour: 'blue', icon: 'folder' },
    });
  });

  it('asks before allowing writes to a new folder', async () => {
    const user = userEvent.setup();
    await renderSection();

    await user.click(await screen.findByRole('button', { name: 'Add folder' }, { timeout: 5000 }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Folder'), 'D:\\data\\sentinel-raw');
    expect(dialog).toHaveAccessibleName('Allow writing to sentinel-raw?');

    await user.click(within(dialog).getByRole('button', { name: /Allow folder/ }));

    await waitFor(() =>
      expect(repository.grantWorkspaceFolder).toHaveBeenCalledWith(
        'ws_flat_ndp',
        'D:\\data\\sentinel-raw',
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('refuses a folder that is already allowed', async () => {
    const user = userEvent.setup();
    await renderSection();

    await user.click(await screen.findByRole('button', { name: 'Add folder' }, { timeout: 5000 }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Folder'), 'D:\\data\\earthscope-raw\\');

    expect(within(dialog).getByText('Already allowed.')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: /Allow folder/ })).toBeDisabled();
  });

  it('removes an additional folder without touching its files', async () => {
    const user = userEvent.setup();
    await renderSection();

    await user.click(await screen.findByRole('button', { name: 'Remove earthscope-raw' }));

    await waitFor(() =>
      expect(repository.revokeWorkspaceFolder).toHaveBeenCalledWith(
        'ws_flat_ndp',
        'D:\\data\\earthscope-raw',
      ),
    );
  });

  it('changes the primary folder after confirming', async () => {
    const user = userEvent.setup();
    await renderSection();

    await user.click(await screen.findByRole('button', { name: 'Change' }));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText('Folder');
    await user.clear(field);
    await user.type(field, 'D:\\science\\campaigns\\flat-NDP-v2');
    await user.click(within(dialog).getByRole('button', { name: /Change folder/ }));

    await waitFor(() =>
      expect(repository.updateWorkspace).toHaveBeenCalledWith('ws_flat_ndp', {
        name: 'flat-NDP',
        root_path: 'D:\\science\\campaigns\\flat-NDP-v2',
      }),
    );
  });

  it('says when there are no additional folders', async () => {
    repository.workspaces.mockResolvedValue([workspace([])]);
    await renderSection();

    expect(await screen.findByText(/No additional folders/)).toBeVisible();
  });

  it('explains a failed load and retries', async () => {
    const user = userEvent.setup();
    repository.workspaces.mockRejectedValueOnce(new Error('The service could not read this list.'));
    await renderSection();

    expect(await screen.findByRole('alert')).toHaveTextContent(/folders could not be loaded/);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/service could not read/);
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByLabelText('Name')).toHaveValue('flat-NDP');
  });

  it('falls back to the first workspace when the route names none', async () => {
    await renderSection('');

    expect(await screen.findByLabelText('Name')).toHaveValue('flat-NDP');
  });
});
