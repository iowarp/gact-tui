import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  relayStatus: vi.fn(),
  configureRelay: vi.fn(),
  disconnectRelay: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: 'http://127.0.0.1:8790', label: 'This device' },
  }),
}));

import { RelaySettings } from './relay-settings';

const disconnected = {
  configured: false,
  reachable: false,
  can_manage: true,
  credential_configured: false,
  http_url: 'http://127.0.0.1:65531',
  reason: 'relay_tools_not_configured',
  details: { missing: ['mcp_url', 'api_token'] },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderSettings() {
  repository.relayStatus.mockResolvedValue(disconnected);
  repository.configureRelay.mockResolvedValue({ ...disconnected, configured: true });
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RelaySettings />
    </QueryClientProvider>,
  );
}

describe('remote work settings', () => {
  it('requires an explicit credential entry before connecting', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole('button', { name: 'Connect remote work' }));
    const connect = screen.getByRole('button', { name: /^Connect$/u });
    expect(connect).toBeDisabled();
    expect(screen.queryByLabelText('Access credential')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enter credential' }));
    const credential = screen.getByLabelText('Access credential');
    expect(credential).toHaveAttribute('autocomplete', 'new-password');
    expect(credential).toHaveValue('');

    await user.type(screen.getByLabelText('Control service address'), 'https://relay.example/mcp');
    await user.clear(screen.getByLabelText('Jobs and artifacts address'));
    await user.type(screen.getByLabelText('Jobs and artifacts address'), 'https://relay.example');
    await user.type(credential, 'test-credential');
    expect(connect).toBeEnabled();
    await user.click(connect);

    await waitFor(() =>
      expect(repository.configureRelay).toHaveBeenCalledWith({
        mcp_url: 'https://relay.example/mcp',
        http_url: 'https://relay.example',
        access_token: 'test-credential',
      }),
    );
  });
});
