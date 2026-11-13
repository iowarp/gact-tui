import { agentResolutionSchema, pluginEntrySchema } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  connectorLogo: vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg"/>'),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));

import { offeredPlugins } from '@/lib/connector-presentation';
import { AgentPluginMenu } from './agent-plugin-menu';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const plugin = (value: Record<string, unknown>) =>
  pluginEntrySchema.parse({ trusted: true, marketplace: 'lab', ...value });

const catalog = [
  plugin({ id: 'tools', ref: 'lab/tools', description: 'Lab tools' }),
  plugin({
    id: 'connector-viewer',
    ref: 'clio-connectors/connector-viewer',
    marketplace: 'clio-connectors',
    description: 'A 3D viewer for scientific data',
    follows: 'viewer',
    connector: {
      id: 'viewer',
      name: 'Scientific viewer with a very long name for narrow screens',
      logo_url: '/v1/connectors/viewer/logo',
      enabled: true,
      status: 'ready',
      tool_count: 12,
    },
  }),
  plugin({
    id: 'connector-off',
    ref: 'clio-connectors/connector-off',
    marketplace: 'clio-connectors',
    follows: 'off',
    connector: { id: 'off', name: 'Off connector', enabled: false },
  }),
];

function renderMenu(added: string[] = []) {
  const onAdd = vi.fn();
  const resolution = agentResolutionSchema.parse({
    agent: { ref: 'clio/standard', id: 'standard', name: 'Standard' },
    plugins: added.map((id) => ({
      id,
      marketplace: 'clio-connectors',
      provenance: { source: 'user' },
      follows: 'viewer',
    })),
    delta: { add: [], remove: [] },
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AgentPluginMenu
          delta={{ add: [], remove: [] }}
          onAdd={onAdd}
          plugins={offeredPlugins(catalog)}
          resolution={resolution}
        >
          <button type="button">Add plugin</button>
        </AgentPluginMenu>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return onAdd;
}

describe('a conversation adds a connector from its plugin picker (CN10)', () => {
  it('lists an enabled connector first, by name, with its state in words', async () => {
    const user = userEvent.setup();
    const onAdd = renderMenu();
    await user.click(screen.getByRole('button', { name: 'Add plugin' }));
    const group = await screen.findByRole('group', { name: 'Connectors' });
    const row = within(group).getByRole('option', {
      name: /Scientific viewer with a very long name/u,
    });
    expect(row.textContent).toContain('Connector');
    expect(row.textContent).toContain('Ready, 12 tools');
    // A connector that is off is left out: Extensions turns it on first.
    expect(screen.queryByText('Off connector')).toBeNull();
    await user.click(row);
    expect(onAdd).toHaveBeenCalledWith('clio-connectors/connector-viewer');
  });

  it('says a connector already in this conversation is there', async () => {
    const user = userEvent.setup();
    renderMenu(['connector-viewer']);
    await user.click(screen.getByRole('button', { name: 'Add plugin' }));
    const group = await screen.findByRole('group', { name: 'Connectors' });
    expect(within(group).getByText('In this conversation')).toBeTruthy();
  });
});
