import { connectorSchema, type Connector, type PendingInteraction } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  connectors: vi.fn(),
  connectorLogo: vi.fn(),
  capabilities: vi.fn(async () => ({ capabilities: {} })),
  agents: vi.fn(async () => []),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));

import { TooltipProvider } from '@/components/ui/tooltip';
import { ConversationInteractionActivity } from './conversation-interaction-activity';
import { ClioPendingInteractions } from './pending-interactions';

const viewer = (value: Partial<Record<string, unknown>> = {}): Connector =>
  connectorSchema.parse({
    id: 'fixture-viewer',
    name: 'Fixture viewer for very large scientific datasets on another machine',
    description: 'Open scientific data on this machine or another, and see it in a tab',
    logo_url: null,
    source: 'catalog',
    enabled: false,
    scope: 'all',
    tool_count: null,
    state: { status: 'ready', needs: [], reason: null },
    needs: [
      { key: 'address', kind: 'address', label: 'Where it runs', required: false },
      { key: 'token', kind: 'secret', label: 'Access token', required: true },
    ],
    ...value,
  });

const offer: PendingInteraction = {
  id: 'connector:abc',
  kind: 'connector_setup',
  owner_session_id: 'sess_root',
  attended_session_id: 'sess_root',
  status: 'pending',
  title: 'Turn on Fixture viewer',
  prompt: 'The agent offers Fixture viewer: Show the dataset in 3D.',
  source: { protocol: 'mcp', tool_name: 'offer_connector', invocation_id: 'call_1' },
  created_at: '2026-11-13T00:00:00Z',
  payload: {
    connector_id: 'fixture-viewer',
    connector_name: 'Fixture viewer for very large scientific datasets on another machine',
    tool_name: 'offer_connector',
    intent: 'enable',
    description: 'Open scientific data on this machine or another, and see it in a tab',
    reason: 'You asked to see the dataset in 3D; this connector opens it in a live view.',
    agent_ref: 'clio/standard',
    agent_name: 'Standard',
    asks_sign_in: true,
    missing: [
      { key: 'address', kind: 'address', label: 'Where it runs', required: false },
      { key: 'token', kind: 'secret', label: 'Access token', required: true },
    ],
  },
  actions: ['submit', 'decline'],
};

function renderWith(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>,
  );
}

function renderDock(onResponse = vi.fn(async () => undefined)) {
  renderWith(
    <ClioPendingInteractions
      interactions={[offer]}
      onResponse={onResponse}
      viewedSessionId="sess_root"
    />,
  );
  return onResponse;
}

beforeEach(() => {
  repository.connectors.mockResolvedValue([viewer()]);
  repository.connectorLogo.mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"/>');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the agent offers a connector that is off', () => {
  it('shows what it is, why the agent asks, its needs and its state in words', async () => {
    renderDock();
    expect(await screen.findByText(/Turn on Fixture viewer for very large/u)).toBeTruthy();
    expect(screen.getByText(offer.payload!.reason as string)).toBeTruthy();
    expect(screen.getByText(offer.payload!.description as string)).toBeTruthy();
    expect(screen.getByText('Not enabled')).toBeTruthy();
    expect(screen.getByLabelText(/Where it runs/u)).toBeTruthy();
    expect(screen.getByText(/asks for the first time the agent uses it/u)).toBeTruthy();
    // A required row keeps Turn on disabled until it is typed.
    expect(screen.getByRole('button', { name: /Turn on/u }).hasAttribute('disabled')).toBe(true);
  });

  it('turns it on for every conversation with the rows typed', async () => {
    const user = userEvent.setup();
    const onResponse = renderDock();
    await user.type(await screen.findByLabelText(/Access token/u), 'zz-token');
    await user.type(screen.getByLabelText(/Where it runs/u), 'node08');
    await user.click(screen.getByRole('button', { name: /^1?\s*Turn on/u }));
    expect(onResponse).toHaveBeenCalledWith(offer, {
      action: 'submit',
      values: { token: 'zz-token', address: 'node08' },
      metadata: { scope: 'all' },
    });
  });

  it('turns it on for this conversation’s agent only', async () => {
    const user = userEvent.setup();
    const onResponse = renderDock();
    await user.type(await screen.findByLabelText(/Access token/u), 't');
    await user.click(screen.getByRole('switch'));
    expect(screen.getByText('Only Standard can use it.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^1?\s*Turn on/u }));
    expect(onResponse).toHaveBeenCalledWith(offer, {
      action: 'submit',
      values: { token: 't' },
      metadata: { scope: 'agent' },
    });
  });

  it('says Not now', async () => {
    const user = userEvent.setup();
    const onResponse = renderDock();
    await user.click(await screen.findByRole('button', { name: /Not now/u }));
    expect(onResponse).toHaveBeenCalledWith(offer, { action: 'decline' });
  });

  it('reads "Turn on …" in its line, waiting for you, then turned on or not now', () => {
    const { rerender } = renderWith(
      <ConversationInteractionActivity artifacts={{}} interaction={offer} />,
    );
    const line = () => document.querySelector('[data-slot="connector-setup-activity"]');
    expect(line()?.textContent).toContain('Turn on');
    expect(screen.getByRole('button', { name: /Choose below/u }).textContent).toBe(
      'waiting for you',
    );
    for (const [status, words] of [
      ['answered', 'turned on'],
      ['denied', 'not now'],
    ] as const) {
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <TooltipProvider>
            <ConversationInteractionActivity artifacts={{}} interaction={{ ...offer, status }} />
          </TooltipProvider>
        </QueryClientProvider>,
      );
      expect(line()?.textContent).toContain(words);
    }
  });
});
