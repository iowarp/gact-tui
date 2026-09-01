import type { McpServerDefinition } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  serviceHealth: vi.fn(),
  relayStatus: vi.fn(),
  mcpServers: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

import { SidebarProvider } from '@/components/ui/sidebar';
import { NavigationInfrastructure } from './navigation-infrastructure';

// jsdom has no media-query engine; the sidebar only asks for the mobile breakpoint.
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function server(overrides: Partial<McpServerDefinition>): McpServerDefinition {
  return {
    id: 'relay',
    name: 'relay',
    status: 'ready',
    tools_count: 3,
    tools: [],
    spec: {},
    ...overrides,
  };
}

function renderInfrastructure(servers: McpServerDefinition[]) {
  repository.serviceHealth.mockResolvedValue({ healthy: true, integrations: [] });
  repository.relayStatus.mockResolvedValue({ reachable: true, configured: true });
  repository.mcpServers.mockResolvedValue(servers);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SidebarProvider>
          <NavigationInfrastructure endpoint="http://127.0.0.1:8790" from="/" />
        </SidebarProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NavigationInfrastructure', () => {
  it('does not warn about a server the service reports as disabled', async () => {
    renderInfrastructure([server({ id: 'ndp', name: 'ndp', status: 'disabled', enabled: false })]);

    await waitFor(() => expect(screen.getByLabelText(/^Infrastructure: /u)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText('Infrastructure: Ready')).toBeInTheDocument());
  });

  it('reports a failing server from its server-owned error instead of its prose', async () => {
    renderInfrastructure([
      server({ id: 'ndp', name: 'ndp', status: 'stalled', error: 'The MCP process exited.' }),
    ]);

    await waitFor(() =>
      expect(screen.getByLabelText('Infrastructure: Needs attention')).toBeInTheDocument(),
    );
  });

  it('prefers the server-configured title over the built-in name map', async () => {
    renderInfrastructure([
      server({ id: 'fs', name: 'fs', status: 'ready', spec: { title: 'Project files' } }),
    ]);

    await waitFor(() => expect(screen.getByLabelText('Infrastructure: Ready')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Show infrastructure status'));

    await waitFor(() => expect(screen.getByText('Project files')).toBeInTheDocument());
    expect(screen.queryByText('Workspace files')).not.toBeInTheDocument();
  });
});
