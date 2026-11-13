import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  capabilities: vi.fn(async () => ({ capabilities: { x_clio_extension_library: true } })),
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
  reconnectSessionMcpServer: vi.fn(),
  connectors: vi.fn(async () => []),
  createConnector: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));

import { TooltipProvider } from '@/components/ui/tooltip';
import { ToolsSettings } from './settings-tools';

function renderSettings(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>,
  );
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
    async (_serverId: string, kind: 'tools' | 'resources') =>
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
  repository.createConnector.mockImplementation(async (input: { name?: string }) => ({
    id: input.name,
    name: input.name,
    enabled: true,
    scope: 'all',
    state: { status: 'ready', needs: [], reason: null },
    tool_count: 0,
    needs: [],
  }));
  repository.removeMcpConfiguration.mockResolvedValue({});
  repository.reconnectMcpServer.mockResolvedValue(external);
  repository.deleteMcpServer.mockResolvedValue(undefined);
});

it('keeps the originating conversation scope in the MCP tab and reconnects its namespace', async () => {
  repository.workspaces.mockResolvedValue([{ id: 'ws_earth', name: 'EarthScope' }]);
  repository.mcpServers.mockResolvedValue([
    {
      ...external,
      id: 'session_mcp_sess_earth_ndp',
      name: 'ndp',
      source: 'plugin',
      session_id: 'sess_earth',
      status: 'failed',
      preparation: {
        state: 'failed',
        phase: 'provision',
        reason: 'mcp_prepare_provision_failed',
        detail: 'Test provision failure',
      },
    },
  ]);
  repository.reconnectSessionMcpServer.mockResolvedValue({ state: 'preparing' });
  renderSettings(
    <ToolsSettings embedded initialWorkspaceId="ws_earth" initialSessionId="sess_earth" />,
  );
  expect(await screen.findByText('MCP services in this conversation')).toBeVisible();
  await waitFor(() =>
    expect(repository.mcpServers).toHaveBeenCalledWith('ws_earth', expect.anything(), {
      sessionId: 'sess_earth',
    }),
  );
  expect(screen.getByText('Unavailable')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Details for ndp' }));
  expect(screen.getByText('The server’s software could not be installed.')).toBeVisible();
  await userEvent.click(screen.getAllByRole('button', { name: 'Reconnect ndp' })[0]!);
  await waitFor(() =>
    expect(repository.reconnectSessionMcpServer).toHaveBeenCalledWith('sess_earth', 'ndp'),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('says why adding is unavailable instead of hiding it in a hover title', async () => {
  repository.capabilities.mockResolvedValueOnce({
    capabilities: { x_clio_extension_library: false },
  });
  renderSettings(<ToolsSettings />);
  expect(await screen.findByText('Needs a newer agent service')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
});

/** The raw connection form sits behind "Add by URL or command"; Command is its other face. */
async function openAdd(kind: 'MCP server URL' | 'Local MCP command', menu = 'Add options') {
  await userEvent.click(await screen.findByRole('button', { name: menu }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Add by URL or command' }));
  const dialog = screen.getByRole('dialog');
  if (kind === 'Local MCP command')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Command' }));
  return dialog;
}
async function pasteField(dialog: HTMLElement, label: string, text: string) {
  const field = within(dialog).getByLabelText(label, { exact: true });
  await userEvent.clear(field);
  await userEvent.click(field);
  await userEvent.paste(text);
}
const confirmAdd = (dialog: HTMLElement) =>
  userEvent.click(within(dialog).getByRole('button', { name: /^Add(?! header| variable)/ }));
const openAdvanced = (dialog: HTMLElement) =>
  userEvent.click(within(dialog).getByRole('button', { name: 'Advanced' }));

describe('tool provider settings', () => {
  it('inspects a declared on-demand connection without querying nonexistent installed-server routes', async () => {
    repository.mcpServers.mockResolvedValue([
      { ...external, id: 'draft_mcp_science', status: 'available' },
    ]);
    renderSettings(<ToolsSettings embedded />);
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Science tools' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Details/ }));
    await userEvent.click(screen.getByRole('radio', { name: 'Connection' }));
    expect(screen.getByRole('complementary')).toHaveTextContent('Starts when used');
    expect(screen.getByText('https://mcp.example.test')).toBeVisible();
    expect(repository.mcpServer).not.toHaveBeenCalled();
    expect(repository.mcpServerInventory).not.toHaveBeenCalled();
  });
  it('keeps inspectable connection fields in the service dialog and hides environment values', async () => {
    repository.mcpServers.mockResolvedValue([external]);
    repository.mcpServer.mockResolvedValue({
      ...external,
      spec: { ...external.spec, env: { PRIVATE_TOKEN: 'never-render-this-value' } },
    });
    renderSettings(<ToolsSettings embedded />);
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Science tools' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Details/ }));
    await userEvent.click(screen.getByRole('radio', { name: 'Connection' }));
    expect(await screen.findByText('https://mcp.example.test')).toBeVisible();
    expect(screen.getByText('PRIVATE_TOKEN. Values are hidden.')).toBeVisible();
    expect(screen.queryByText('never-render-this-value')).not.toBeInTheDocument();
  });
  it('keeps human connection labels and derives a valid tool namespace on save', async () => {
    renderSettings(<ToolsSettings embedded />);
    const dialog = await openAdd('MCP server URL', 'Add MCP options');
    await pasteField(dialog, 'Name', 'Research Tools');
    await pasteField(dialog, 'MCP server URL', 'https://mcp.example.test');
    await confirmAdd(dialog);
    // An address alone becomes a connector (CN1, AQ11), enabled for every conversation.
    await waitFor(() =>
      expect(repository.createConnector).toHaveBeenCalledWith({
        url: 'https://mcp.example.test',
        name: 'Research Tools',
        scope: 'all',
      }),
    );
    expect(repository.configureMcpServer).not.toHaveBeenCalled();
  });
  it('opens the URL form from the face of the Add split button', async () => {
    renderSettings(<ToolsSettings embedded />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add MCP' }));
    expect(
      within(screen.getByRole('dialog')).getByLabelText('MCP server URL', { exact: true }),
    ).toBeVisible();
  });
  it('installs a local package with explicit argv and opt-in conversation access', async () => {
    renderSettings(<ToolsSettings embedded />);
    const dialog = await openAdd('Local MCP command', 'Add MCP options');
    await pasteField(dialog, 'Name', 'fetch-qualification');
    await pasteField(dialog, 'Arguments', '["mcp-server-fetch"]');
    await confirmAdd(dialog);
    await waitFor(() =>
      expect(repository.createConnector).toHaveBeenCalledWith({
        command: 'uvx',
        args: ['mcp-server-fetch'],
        name: 'fetch-qualification',
        scope: 'all',
      }),
    );
  });
  it('shows catalog loading instead of an unexplained empty frame', () => {
    repository.tools.mockReturnValue(new Promise(() => undefined));
    renderSettings(<ToolsSettings />);

    expect(screen.getByText('Loading MCP servers…')).toBeVisible();
  });

  it('keeps exact tool identifiers and provider documentation behind hover', async () => {
    const user = userEvent.setup();
    repository.mcpServerInventory.mockResolvedValue([]);
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

    await user.click(await screen.findByRole('button', { name: 'Details for Workspace files' }));
    const files = await screen.findByRole('group', { name: 'Tools of Workspace files' });
    const tool = within(files).getByText('Read workspace file');
    expect(tool).toBeVisible();
    expect(
      within(files).getByText('Reads a file that this workspace has granted the agent access to.'),
    ).toBeVisible();
    expect(screen.queryByText('fs_read_file')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Technical provider documentation with internal implementation details.'),
    ).not.toBeInTheDocument();
    expect(tool).toHaveAttribute(
      'title',
      'fs_read_file\nTechnical provider documentation with internal implementation details.',
    );
  });
  it('opens provider-owned tools, resources, and prompts without exposing an editable built-in', async () => {
    const user = userEvent.setup();
    renderSettings(<ToolsSettings />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Workspace files' }));
    expect(screen.queryByRole('menuitem', { name: 'Reconnect' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Disconnect' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /^Details/ }));
    expect(await screen.findByText('Read file')).toBeVisible();
    expect(
      screen.getByText('Reads a file that this workspace has granted the agent access to.'),
    ).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'Resources' }));
    expect(screen.getByText('This server reported no resources.')).toBeVisible();
    // A server's prompts are commands; the tab says where to find them.
    await user.click(screen.getByRole('radio', { name: 'Prompts' }));
    expect(screen.getByText(/This service’s prompts are commands/)).toBeVisible();
  });

  it('connects a remote provider through the shared URL setup', async () => {
    renderSettings(<ToolsSettings />);
    const dialog = await openAdd('MCP server URL');
    await pasteField(dialog, 'Name', 'science-tools');
    await pasteField(dialog, 'MCP server URL', 'https://mcp.example.test');
    await confirmAdd(dialog);
    await waitFor(() =>
      expect(repository.createConnector).toHaveBeenCalledWith({
        url: 'https://mcp.example.test',
        name: 'science-tools',
        scope: 'all',
      }),
    );
  });
  it('keeps local process settings collapsed and sends table entries to the service', async () => {
    renderSettings(<ToolsSettings />);
    const dialog = await openAdd('Local MCP command');
    await pasteField(dialog, 'Name', 'web-search');
    await pasteField(dialog, 'Command', 'web-tools');
    await pasteField(dialog, 'Arguments', '["serve"]');
    expect(within(dialog).queryByLabelText('Variable 1')).not.toBeInTheDocument();
    await openAdvanced(dialog);
    await pasteField(dialog, 'Variable 1', 'WEB_STATE_DIR');
    await pasteField(dialog, 'Value 1', 'D:\\agent-state');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add variable' }));
    await pasteField(dialog, 'Variable 2', 'WEB_MODE');
    await pasteField(dialog, 'Value 2', 'a=b');
    await confirmAdd(dialog);
    await waitFor(() =>
      expect(repository.configureMcpServer).toHaveBeenCalledWith('web-search', {
        name: 'web-search',
        transport: 'stdio',
        command: 'web-tools',
        args: ['serve'],
        env: { WEB_STATE_DIR: 'D:\\agent-state', WEB_MODE: 'a=b' },
        always_load: false,
        connection_only: true,
      }),
    );
  }, 15_000);
  it('keeps table and raw process settings in sync in shared setup', async () => {
    renderSettings(<ToolsSettings />);
    const dialog = await openAdd('Local MCP command');
    await openAdvanced(dialog);
    await pasteField(dialog, 'Variable 1', 'TOKEN');
    await pasteField(dialog, 'Value 1', 'secret');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Raw input' }));
    expect(within(dialog).getByLabelText('Process settings')).toHaveValue('TOKEN=secret');
    await pasteField(dialog, 'Process settings', 'A=1\nB=2');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Raw input' }));
    expect(within(dialog).getByLabelText('Variable 2')).toHaveValue('B');
    expect(within(dialog).getByLabelText('Value 2')).toHaveValue('2');
  });
  it('adds a connection to every conversation only when explicitly selected', async () => {
    renderSettings(<ToolsSettings />);
    const dialog = await openAdd('MCP server URL');
    await pasteField(dialog, 'Name', 'docs');
    await pasteField(dialog, 'MCP server URL', 'https://mcp.example.test');
    await openAdvanced(dialog);
    await userEvent.click(
      within(dialog).getByRole('switch', { name: 'Available in every conversation' }),
    );
    await confirmAdd(dialog);
    await waitFor(() =>
      expect(repository.configureMcpServer).toHaveBeenCalledWith(
        'docs',
        expect.objectContaining({ always_load: true }),
      ),
    );
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

    const services = await screen.findByRole('group', { name: 'MCP servers' });
    const saved = (await within(services).findByText('colab-mcp')).closest(
      '[data-slot="item-row"]',
    ) as HTMLElement;
    expect(saved).not.toHaveTextContent('uvx');
    expect(saved).toHaveTextContent('Yours, local command');
    expect(saved).toHaveTextContent('Not started');
    await user.click(within(saved).getByRole('button', { name: 'Actions for colab-mcp' }));
    await user.click(screen.getByRole('menuitem', { name: /^Remove saved/ }));
    const ask = within(saved).getByRole('group', { name: 'Remove colab-mcp?' });
    expect(within(ask).getByRole('button', { name: 'Keep' })).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(within(ask).getByRole('button', { name: 'Remove' }));
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

    const actions = screen.getByRole('button', { name: 'Reconnect Science tools' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(actions).toHaveAttribute('aria-busy', 'true');
    expect(actions).toBeDisabled();
    expect(actions.querySelector('svg')).toHaveClass('animate-spin');
    await act(async () => finishReconnect(external));
    await waitFor(() => expect(actions).toBeEnabled());
    expect(actions).toHaveAttribute('aria-busy', 'false');

    await user.click(screen.getByRole('button', { name: 'Actions for Science tools' }));
    await user.click(screen.getByRole('menuitem', { name: 'Disconnect' }));
    const confirmation = screen.getByRole('group', { name: 'Disconnect Science tools?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Keep' }));
    expect(screen.queryByRole('group', { name: 'Disconnect Science tools?' })).toBeNull();
    expect(repository.deleteMcpServer).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Actions for Science tools' }));
    await user.click(screen.getByRole('menuitem', { name: 'Disconnect' }));
    await user.click(
      within(screen.getByRole('group', { name: 'Disconnect Science tools?' })).getByRole('button', {
        name: 'Disconnect',
      }),
    );
    expect(repository.deleteMcpServer).toHaveBeenCalledWith('mcp_ext_science');
  });
});
