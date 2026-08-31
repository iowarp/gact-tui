import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelsSettings } from './settings-models';

const repository = vi.hoisted(() => ({
  providers: vi.fn().mockResolvedValue([
    {
      id: 'codex',
      name: 'Codex',
      auth_methods: [],
      is_authenticated: true,
      metadata: {},
    },
  ]),
  languageModelConfiguration: vi.fn().mockResolvedValue({
    configured: true,
    provider: 'codex',
    api_base: '',
    model: 'gpt-5.6-luna',
    thinking_level: 'medium',
    presets: [
      {
        id: 'codex',
        label: 'Codex',
        provider: 'codex',
        suggested_model: 'gpt-5.6-luna',
        requires_api_key: false,
        is_authenticated: true,
        supports_live_catalog: true,
        supports_vision: true,
      },
    ],
  }),
  providerModels: vi.fn().mockResolvedValue({
    provider_id: 'codex',
    models: [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' }],
    source: 'codex_app_server',
  }),
  refreshProviderModels: vi.fn().mockResolvedValue([
    {
      provider: 'codex',
      discovered: [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' }],
      source: 'codex_app_server',
      default_model: 'gpt-5.6-luna',
      generated_at: '2026-08-23T05:00:00Z',
      added: [],
      removed: [],
      unchanged: ['gpt-5.6-luna'],
      rejected: [],
    },
  ]),
  providerHandshake: vi.fn().mockResolvedValue({
    models: [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' }],
    source: 'codex_app_server',
    connectivity: 'ok',
    auth: 'not_required',
    latency_ms: 18.4,
    generated_at: '2026-08-23T05:00:00Z',
  }),
  authenticateProvider: vi.fn(),
  updateLanguageModelConfiguration: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ModelsSettings', () => {
  it('refreshes the selected service catalog and reports its provenance and delta', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ModelsSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('combobox', { name: 'Reasoning effort' })).toHaveTextContent(
      'Medium',
    );
    await user.click(await screen.findByRole('button', { name: 'Refresh model catalog' }));
    await waitFor(() => expect(repository.refreshProviderModels).toHaveBeenCalledWith(['codex']));
    expect(await screen.findByText('Catalog refreshed')).toBeVisible();
    expect(screen.getByText(/1 available model, 0 added, 0 removed/)).toBeVisible();
    expect(screen.getByText(/Checked .* by the connected agent/)).toBeVisible();
    expect(screen.queryByText(/codex_app_server/)).not.toBeInTheDocument();
  });

  it('checks provider connectivity without changing the selected model', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ModelsSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Check provider' }));
    await waitFor(() =>
      expect(repository.providerHandshake).toHaveBeenCalledWith('codex', {
        apiBase: '',
        refresh: true,
      }),
    );
    expect(await screen.findByText('Provider ready')).toBeVisible();
    expect(screen.getByText(/Connection ok, sign-in not required, 1 model/)).toBeVisible();
    expect(screen.getByText(/Checked .* in 18 ms/)).toBeVisible();
    expect(screen.queryByText(/codex_app_server/)).not.toBeInTheDocument();
    expect(repository.updateLanguageModelConfiguration).not.toHaveBeenCalled();
  });
});
