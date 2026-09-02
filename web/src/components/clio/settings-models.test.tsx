import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { ModelsSettings } from './settings-models';

const { configuration, repository } = vi.hoisted(() => {
  const configuration = {
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
  };
  return { configuration, repository: makeRepository(configuration) };

  function makeRepository(active: typeof configuration) {
    return {
      providers: vi.fn().mockResolvedValue([
        {
          id: 'codex',
          name: 'Codex',
          auth_methods: [],
          is_authenticated: true,
          metadata: {},
        },
      ]),
      languageModelConfiguration: vi.fn().mockResolvedValue(active),
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
    };
  }
});

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  repository.providerModels.mockResolvedValue({
    provider_id: 'codex',
    models: [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' }],
    source: 'codex_app_server',
  });
});

describe('ModelsSettings', () => {
  it('preserves the authoritative configured model when opened for its provider', async () => {
    repository.languageModelConfiguration.mockResolvedValueOnce({
      configured: true,
      provider: 'codex',
      api_base: 'codex://app-server',
      model: 'gpt-5.6-luna',
      thinking_level: 'medium',
      presets: [
        {
          id: 'codex',
          label: 'Codex',
          provider: 'codex',
          api_base: 'codex://app-server',
          suggested_model: 'gpt-5.5',
          requires_api_key: false,
          is_authenticated: true,
          supports_live_catalog: true,
          supports_vision: true,
        },
      ],
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <MemoryRouter initialEntries={['/settings/providers?provider=codex']}>
        <QueryClientProvider client={queryClient}>
          <ModelsSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('combobox', { name: 'Model' })).toHaveTextContent(
      'gpt-5.6-luna',
    );
    expect(screen.getByRole('textbox', { name: 'Endpoint / API base' })).toHaveValue(
      'codex://app-server',
    );
  });

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

  it('never writes a maximum token cap the service did not report', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ModelsSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Apply provider and model' }));

    await waitFor(() => expect(repository.updateLanguageModelConfiguration).toHaveBeenCalled());
    const [payload] = repository.updateLanguageModelConfiguration.mock.calls[0];
    expect(payload).not.toHaveProperty('max_tokens');
    expect(screen.getByRole('spinbutton', { name: 'Maximum output tokens' })).toHaveValue(null);
  });

  it('applies a model choice without rewriting the runtime sizing or reasoning level', async () => {
    repository.providerModels.mockResolvedValue({
      provider_id: 'codex',
      models: [
        { id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' },
        { id: 'gpt-5.6-nova', name: 'gpt-5.6-nova' },
      ],
      source: 'codex_app_server',
    });
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ModelsSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('combobox', { name: 'Model' }));
    await user.click(await screen.findByRole('option', { name: 'gpt-5.6-nova' }));
    await user.click(screen.getByRole('button', { name: 'Apply provider and model' }));

    await waitFor(() => expect(repository.updateLanguageModelConfiguration).toHaveBeenCalled());
    expect(repository.updateLanguageModelConfiguration).toHaveBeenCalledWith({
      provider: 'codex',
      api_base: '',
      model: 'gpt-5.6-nova',
    });
  });

  it('adopts a configuration the service changed, until the person edits the panel', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ModelsSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const maxTokens = await screen.findByRole('spinbutton', { name: 'Maximum output tokens' });
    expect(maxTokens).toHaveValue(null);

    const configurationKey = queryKeys.key('language-model-configuration', 'http://127.0.0.1:8787');
    act(() => {
      queryClient.setQueryData(configurationKey, { ...configuration, max_tokens: 12_000 });
    });
    await waitFor(() => expect(maxTokens).toHaveValue(12_000));

    await user.clear(maxTokens);
    await user.type(maxTokens, '6000');
    act(() => {
      queryClient.setQueryData(configurationKey, {
        ...configuration,
        max_tokens: 20_000,
        thinking_level: 'high',
      });
    });
    // The section heading reads the service configuration directly, so it
    // arriving there is the proof that the panel saw it and deliberately kept
    // what the person is in the middle of setting.
    expect(await screen.findByText('New sessions start with high reasoning.')).toBeVisible();
    expect(maxTokens).toHaveValue(6_000);
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
