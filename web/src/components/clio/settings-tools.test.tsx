import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  workspaces: vi.fn(),
  mcpServers: vi.fn(),
  tools: vi.fn(),
  mcpServer: vi.fn(),
  mcpServerInventory: vi.fn(),
  configureMcpServer: vi.fn(),
  savedMcpServices: vi.fn(),
  removeMcpConfiguration: vi.fn(),
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
  repository.configureMcpServer.mockImplementation(async (name: string) => ({
    name,
    configured: true,
    scope: 'user',
    status: 'ready',
    tools: [],
    tools_count: 0,
    retryable: false,
  }));
  repository.savedMcpServices.mockResolvedValue([]);
  repository.removeMcpConfiguration.mockResolvedValue({});
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

    const files = await screen.findByRole('list', { name: 'Tools of Workspace files' });
    expect(within(files).getByText('Read workspace file')).toBeVisible();
    expect(
      screen.getByText('Reads a file that this workspace has granted the agent access to.'),
    ).toBeVisible();
    expect(screen.queryByText('fs_read_file')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Technical provider documentation with internal implementation details.'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Read workspace file: show details' }));
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
    await user.click(screen.getByRole('menuitem', { name: 'Resources and prompts' }));
    expect(await screen.findByText('Read file')).toBeVisible();
    expect(screen.getByText('Read a workspace file.')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Resources' }));
    expect(screen.getByText('This provider reported no resources.')).toBeVisible();
  });

  it('connects a remote provider using task-oriented labels', async () => {
    const user = userEvent.setup();
    renderSettings(<ToolsSettings />);

    await user.click(await screen.findByRole('button', { name: 'Connect MCP' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'Science tools');
    await user.type(within(dialog).getByLabelText('Service address'), 'https://mcp.example.test');
    await user.click(within(dialog).getByRole('button', { name: 'Connect MCP' }));

    // Saved, so it survives a restart and reaches every conversation by default.
    expect(repository.configureMcpServer).toHaveBeenCalledWith('Science tools', {
      transport: 'http',
      url: 'https://mcp.example.test',
      always_load: true,
    });
  });

  it('keeps local provider process settings collapsed and sends them to the service', async () => {
    const user = userEvent.setup();
    renderSettings(<ToolsSettings />);

    await user.click(await screen.findByRole('button', { name: 'Connect MCP' }));
    const dialog = screen.getByRole('dialog');
    // Paste, not per-keystroke typing: the fields only need their values, and
    // ~60 synthetic keystrokes pushed this test past the timeout under load.
    const fill = async (label: string, text: string) => {
      await user.click(within(dialog).getByLabelText(label));
      await user.paste(text);
    };
    await fill('Name', 'Web search');
    await user.click(within(dialog).getByLabelText('Connection type'));
    await user.click(screen.getByRole('option', { name: 'Local command' }));
    await fill('Executable', 'web-tools');
    await fill('Arguments', 'serve');
    expect(within(dialog).queryByLabelText('Process settings')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Advanced configuration' }));
    // A Variable / Value table, the way the system environment editor shows it.
    await fill('Variable 1', 'WEB_STATE_DIR');
    await fill('Value 1', 'D:\\agent-state');
    await user.click(within(dialog).getByRole('button', { name: 'Add variable' }));
    await fill('Variable 2', 'WEB_MODE');
    await fill('Value 2', 'a=b');
    await user.click(within(dialog).getByRole('button', { name: 'Connect MCP' }));

    expect(repository.configureMcpServer).toHaveBeenCalledWith('Web search', {
      always_load: true,
      transport: 'stdio',
      command: 'web-tools',
      args: ['serve'],
      env: { WEB_STATE_DIR: 'D:\\agent-state', WEB_MODE: 'a=b' },
    });
  });

  it('switches the process settings between the table and raw NAME=value lines', async () => {
    const user = userEvent.setup();
    renderSettings(<ToolsSettings />);

    await user.click(await screen.findByRole('button', { name: 'Connect MCP' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText('Connection type'));
    await user.click(screen.getByRole('option', { name: 'Local command' }));
    await user.click(within(dialog).getByRole('button', { name: 'Advanced configuration' }));
    await user.click(within(dialog).getByLabelText('Variable 1'));
    await user.paste('TOKEN');
    await user.click(within(dialog).getByLabelText('Value 1'));
    await user.paste('secret');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Raw input' }));
    const raw = within(dialog).getByLabelText('Process settings');
    expect(raw).toHaveValue('TOKEN=secret');
    await user.clear(raw);
    await user.paste('A=1\nB=2');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Raw input' }));
    expect(within(dialog).getByLabelText('Variable 2')).toHaveValue('B');
    expect(within(dialog).getByLabelText('Value 2')).toHaveValue('2');
  });

  it('saves a service for conversations that ask for it when the box is cleared', async () => {
    const user = userEvent.setup();
    renderSettings(<ToolsSettings />);

    await user.click(await screen.findByRole('button', { name: 'Connect MCP' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'docs');
    await user.type(within(dialog).getByLabelText('Service address'), 'https://mcp.example.test');
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Available in every conversation' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Connect MCP' }));

    expect(repository.configureMcpServer).toHaveBeenCalledWith('docs', {
      transport: 'http',
      url: 'https://mcp.example.test',
      always_load: false,
    });
  });

  it('lists the saved services and removes one after confirming', async () => {
    const user = userEvent.setup();
    repository.savedMcpServices.mockResolvedValue([
      {
        name: 'colab-mcp',
        transport: 'stdio',
        always_load: true,
        spec: { command: 'uvx', args: ['git+https://github.com/googlecolab/colab-mcp'] },
      },
    ]);
    renderSettings(<ToolsSettings />);

    const services = await screen.findByRole('list', { name: 'MCP services' });
    const saved = (await within(services).findByText('colab-mcp')).closest('li') as HTMLElement;
    expect(saved).toHaveTextContent('uvx git+https://github.com/googlecolab/colab-mcp');
    expect(saved).toHaveTextContent('Yours, local command, every conversation');
    expect(saved).toHaveTextContent('Not started');
    await user.click(within(saved).getByRole('button', { name: 'Actions for colab-mcp' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
    );
    await waitFor(() =>
      expect(repository.removeMcpConfiguration).toHaveBeenCalledWith('colab-mcp'),
    );
  });

  it('exposes reconnect and confirmed disconnect only for runtime connections', async () => {
    const user = userEvent.setup();
    repository.mcpServers.mockResolvedValue([external]);
    let finishReconnect!: (server: typeof external) => void;
    repository.reconnectMcpServer.mockReturnValueOnce(
      new Promise<typeof external>((resolve) => {
        finishReconnect = resolve;
      }),
    );
    renderSettings(<ToolsSettings />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Science tools' }));
    await user.click(screen.getByRole('menuitem', { name: 'Reconnect' }));
    expect(repository.reconnectMcpServer).toHaveBeenCalledWith('mcp_ext_science');

    const actions = screen.getByRole('button', { name: 'Actions for Science tools' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(actions).toHaveAttribute('aria-busy', 'true');
    expect(actions).toBeDisabled();
    expect(actions.querySelector('svg')).toHaveClass('animate-spin');
    await act(async () => finishReconnect(external));
    await waitFor(() => expect(actions).toBeEnabled());
    expect(actions).toHaveAttribute('aria-busy', 'false');

    await user.click(screen.getByRole('button', { name: 'Actions for Science tools' }));
    await user.click(screen.getByRole('menuitem', { name: 'Disconnect' }));
    const confirmation = screen.getByRole('alertdialog');
    expect(within(confirmation).getByText(/transcript evidence remains readable/i)).toBeVisible();
    await user.click(within(confirmation).getByRole('button', { name: 'Disconnect provider' }));
    expect(repository.deleteMcpServer).toHaveBeenCalledWith('mcp_ext_science');
  });
});
