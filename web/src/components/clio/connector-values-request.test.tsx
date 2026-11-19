import { connectorSchema, type Connector, type PendingInteraction } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  connectors: vi.fn(),
  sessionConnector: vi.fn(),
  connectorLogo: vi.fn(),
  capabilities: vi.fn(async () => ({ capabilities: { x_clio_agent_plugins: true } })),
  agents: vi.fn(async () => []),
  plugins: vi.fn(async () => ({ plugins: [], default_marketplace_error: null })),
  inspectPlugin: vi.fn(),
  mcpServers: vi.fn(async () => []),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));

import { TooltipProvider } from '@/components/ui/tooltip';
import { ClioPendingInteractions } from './pending-interactions';

const parts = (): Connector =>
  connectorSchema.parse({
    id: 'fixture-parts',
    name: 'Fixture parts',
    description: 'Search parts',
    logo_url: null,
    source: 'catalog',
    enabled: true,
    tool_count: 12,
    state: { status: 'ready', needs: [], reason: null },
    needs: [
      { key: 'where', kind: 'value', label: 'Where', required: false },
      {
        key: 'cat_id',
        kind: 'value',
        label: 'Catalog ID',
        required: false,
        group: 'Part catalogs',
      },
      {
        key: 'cat_secret',
        kind: 'secret',
        label: 'Catalog secret',
        required: false,
        group: 'Part catalogs',
      },
    ],
  });

const asking: PendingInteraction = {
  id: 'connector:vals',
  kind: 'connector_setup',
  owner_session_id: 'sess_root',
  attended_session_id: 'sess_root',
  status: 'pending',
  title: 'Fixture parts: add Catalog ID, Catalog secret?',
  prompt: 'The agent offers Fixture parts: the free search hit its limit.',
  source: { protocol: 'mcp', tool_name: 'offer_plugin', invocation_id: 'call_2' },
  created_at: '2026-11-15T00:00:00Z',
  payload: {
    connector_id: 'fixture-parts',
    connector_name: 'Fixture parts',
    tool_name: 'offer_plugin',
    intent: 'values',
    description: 'Search parts',
    reason: 'The free search hit its limit; a catalog key adds every distributor.',
    agent_ref: 'clio/standard',
    agent_name: 'Standard',
    asks_sign_in: false,
    connector_enabled: true,
    missing: [
      {
        key: 'cat_id',
        kind: 'value',
        label: 'Catalog ID',
        required: false,
        group: 'Part catalogs',
      },
      {
        key: 'cat_secret',
        kind: 'secret',
        label: 'Catalog secret',
        required: false,
        group: 'Part catalogs',
      },
    ],
  },
  actions: ['submit', 'decline'],
};

function renderCard(onResponse = vi.fn(async () => undefined)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (children: ReactNode) => (
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
  render(
    wrap(
      <ClioPendingInteractions
        interactions={[asking]}
        onResponse={onResponse}
        viewedSessionId="sess_root"
      />,
    ),
  );
  return onResponse;
}

beforeEach(() => {
  repository.connectors.mockResolvedValue([parts()]);
  repository.sessionConnector.mockImplementation(async () => parts());
  repository.connectorLogo.mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"/>');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the agent asks for optional needs of a connector already here (KC5)', () => {
  it('names what it asks for, shows only those rows inline under their group, and the reason', async () => {
    renderCard();
    expect(
      await screen.findByText('Give Fixture parts Catalog ID, Catalog secret?', undefined, {
        timeout: 4000,
      }),
    ).toBeTruthy();
    expect(screen.getByLabelText(/Catalog ID/u, { selector: 'input' })).toBeTruthy();
    expect(screen.getByLabelText(/Catalog secret/u, { selector: 'input' })).toBeTruthy();
    expect(screen.queryByLabelText(/^Where/u, { selector: 'input' })).toBeNull();
    expect(screen.getAllByRole('heading', { name: 'Part catalogs' })).toHaveLength(1);
    expect(screen.getAllByText(/a catalog key adds every distributor/u).length).toBeGreaterThan(0);
  });

  it('saves the typed values and declines with Not now', async () => {
    const user = userEvent.setup();
    const onResponse = renderCard();
    await user.type(await screen.findByLabelText(/Catalog ID/u, { selector: 'input' }), 'id-1');
    await user.type(screen.getByLabelText(/Catalog secret/u, { selector: 'input' }), 'sec-1');
    await user.click(screen.getByRole('button', { name: /^1?\s*Save$/u }));
    expect(onResponse).toHaveBeenCalledWith(asking, {
      action: 'submit',
      values: { cat_id: 'id-1', cat_secret: 'sec-1' },
      metadata: { save_as_default: [] },
    });
  });
});
