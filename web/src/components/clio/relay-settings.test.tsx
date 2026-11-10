import { mcpServerDefinitionSchema } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RelaySettings } from './relay-settings';

const repository = vi.hoisted(() => ({
  mcpServers: vi.fn(),
  savedMcpServices: vi.fn(),
  reconnectMcpServer: vi.fn(),
  deleteMcpServer: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://test' } }),
}));

const server = (fields: Record<string, unknown>) =>
  mcpServerDefinitionSchema.parse({ tools: [], tools_count: 0, ...fields });

const REMOTE = server({
  id: 'mcp_ext_home_assistant',
  name: 'home-assistant',
  status: 'failed',
  reason: 'No answer from mcp.home.lan',
  transport: 'http',
  source: 'user',
  spec: { url: 'https://mcp.home.lan/sse' },
});
const LOCAL = server({
  id: 'mcp_postgres',
  name: 'postgres',
  status: 'stopped',
  transport: 'stdio',
  source: 'user',
  spec: { command: 'uvx', args: ['mcp-postgres'] },
});

function renderRemote() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>
          <RelaySettings />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  repository.savedMcpServices.mockResolvedValue([]);
  repository.reconnectMcpServer.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('lists only the MCP servers reached by URL, with their state in words', async () => {
  repository.mcpServers.mockResolvedValue([REMOTE, LOCAL]);
  renderRemote();
  const list = await screen.findByRole('group', { name: 'Remote MCP servers' });
  expect(within(list).getAllByText('home-assistant')[0]).toBeVisible();
  expect(within(list).getAllByText('mcp.home.lan')[0]).toBeVisible();
  expect(within(list).getAllByText('Unavailable')[0]).toBeVisible();
  expect(screen.queryByText('postgres')).toBeNull();
  expect(
    screen.getByText(/Relay placements from earlier versions are not converted/u),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Add a remote MCP server by URL' })).toBeVisible();
});

it('says when there are no remote tools, and when the servers cannot be listed', async () => {
  repository.mcpServers.mockResolvedValue([LOCAL]);
  renderRemote();
  expect(await screen.findByText('No remote MCP servers yet.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Add by URL' })).toBeVisible();
  cleanup();

  repository.mcpServers.mockRejectedValue(new Error('offline'));
  renderRemote();
  expect(await screen.findByText('Remote servers could not be listed')).toBeVisible();
  repository.mcpServers.mockResolvedValue([REMOTE]);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
  expect((await screen.findAllByText('home-assistant'))[0]).toBeVisible();
});
