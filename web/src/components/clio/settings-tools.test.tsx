import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  workspaces: vi.fn(),
  mcpServers: vi.fn(),
  tools: vi.fn(),
  mcpServer: vi.fn(),
  mcpServerInventory: vi.fn(),
  installMcpServer: vi.fn(),
  reconnectMcpServer: vi.fn(),
  deleteMcpServer: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

import { ToolsSettings } from './settings-tools';

function renderSettings(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

const builtIn = {
  id: 'mcp_files',
  name: 'fs',
  status: 'ready',
  transport: 'in_process',
  tools_count: 1,
  tools: ['fs_read_file'],
  spec: {},
};

const external = {
  id: 'mcp_ext_science',
  name: 'Science tools',
  status: 'ready',
  transport: 'http',
  tools_count: 1,
  tools: ['catalog_search'],
  spec: { transport: 'http', url: 'https://mcp.example.test' },
};

beforeEach(() => {
  repository.workspaces.mockResolvedValue([]);
  repository.mcpServers.mockResolvedValue([builtIn]);
  repository.tools.mockResolvedValue([]);
  repository.mcpServer.mockResolvedValue(builtIn);
  repository.mcpServerInventory.mockImplementation(
    async (_serverId: string, kind: 'tools' | 'resources' | 'prompts') =>
      kind === 'tools'
        ? [{ name: 'fs_read_file', title: 'Read file', description: 'Read a workspace file.' }]
        : [],
  );
  repository.installMcpServer.mockResolvedValue(external);
  repository.reconnectMcpServer.mockResolvedValue(external);
  repository.deleteMcpServer.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('tool provider settings', () => {
  it('shows catalog loading instead of an unexplained empty frame', () => {
    repository.tools.mockReturnValue(new Promise(() => undefined));
    renderSettings(<ToolsSettings />);

    expect(screen.getByRole('status', { name: 'Loading available tools' })).toBeVisible();
  });

  it('keeps exact tool identifiers and provider documentation behind details', async () => {
    const user = userEvent.setup();
    repository.tools.mockResolvedValue([
      {
        id: 'fs_read_file',
        name: 'fs_read_file',
        title: 'Read workspace file',
        description: 'Technical provider documentation with internal implementation details.',
        server_id: 'mcp_files',
        tags: [],
        visible_to: [],
      },
    ]);
    renderSettings(<ToolsSettings />);

    expect(await screen.findByText('Read workspace file')).toBeVisible();
    expect(
      screen.getByText('Reads a file that this workspace has granted the agent access to.'),
    ).toBeVisible();
    expect(screen.queryByText('fs_read_file')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Technical provider documentation with internal implementation details.'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show details for Read workspace file' }));
    expect(screen.getByText('fs_read_file')).toBeVisible();
    expect(
      screen.getByText('Technical provider documentation with internal implementation details.'),
    ).toBeVisible();
  });

  it('opens provider-owned tools, resources, and prompts without exposing an editable built-in', async () => {
    const user = userEvent.setup();
    renderSettings(<ToolsSettings />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Workspace files' }));
    expect(screen.queryByRole('menuitem', { name: 'Reconnect' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Disconnect' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'View contents' }));
    expect(await screen.findByText('Read file')).toBeVisible();
    expect(screen.getByText('Read a workspace file.')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Resources' }));
    expect(screen.getByText('This provider reported no resources.')).toBeVisible();
  });

  it('connects a remote provider using task-oriented labels', async () => {
    const user = userEvent.setup();
    renderSettings(<ToolsSettings />);

    await user.click(await screen.findByRole('button', { name: 'Connect provider' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'Science tools');
    await user.type(within(dialog).getByLabelText('Service address'), 'https://mcp.example.test');
    await user.click(within(dialog).getByRole('button', { name: 'Connect provider' }));

    expect(repository.installMcpServer).toHaveBeenCalledWith({
      name: 'Science tools',
      transport: 'http',
      url: 'https://mcp.example.test',
    });
  });

  it('keeps local provider process settings collapsed and sends them to the service', async () => {
    const user = userEvent.setup();
    renderSettings(<ToolsSettings />);

    await user.click(await screen.findByRole('button', { name: 'Connect provider' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'Web search');
    await user.click(within(dialog).getByLabelText('Connection type'));
    await user.click(screen.getByRole('option', { name: 'Local command' }));
    await user.type(within(dialog).getByLabelText('Executable'), 'web-tools');
    await user.type(within(dialog).getByLabelText('Arguments'), 'serve');
    expect(within(dialog).queryByLabelText('Process settings')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Advanced configuration' }));
    await user.type(
      within(dialog).getByLabelText('Process settings'),
      'WEB_STATE_DIR=D:\\agent-state',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Connect provider' }));

    expect(repository.installMcpServer).toHaveBeenCalledWith({
      name: 'Web search',
      transport: 'stdio',
      command: 'web-tools',
      args: ['serve'],
      env: { WEB_STATE_DIR: 'D:\\agent-state' },
    });
  });

  it('exposes reconnect and confirmed disconnect only for runtime connections', async () => {
    const user = userEvent.setup();
    repository.mcpServers.mockResolvedValue([external]);
    renderSettings(<ToolsSettings />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Science tools' }));
    await user.click(screen.getByRole('menuitem', { name: 'Reconnect' }));
    expect(repository.reconnectMcpServer).toHaveBeenCalledWith('mcp_ext_science');

    await user.click(screen.getByRole('button', { name: 'Actions for Science tools' }));
    await user.click(screen.getByRole('menuitem', { name: 'Disconnect' }));
    const confirmation = screen.getByRole('alertdialog');
    expect(within(confirmation).getByText(/transcript evidence remains readable/i)).toBeVisible();
    await user.click(within(confirmation).getByRole('button', { name: 'Disconnect provider' }));
    expect(repository.deleteMcpServer).toHaveBeenCalledWith('mcp_ext_science');
  });
});
