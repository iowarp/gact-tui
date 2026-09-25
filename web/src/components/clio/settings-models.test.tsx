import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { useLiveStore } from '@/store/live-store';
import { ModelsSettings } from './settings-models';

const { codexCatalog, configuration, repository } = vi.hoisted(() => {
  const configuration = {
    configured: true,
    provider_id: 'codex',
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
        auth_method: 'subscription',
        is_authenticated: true,
        supports_live_catalog: true,
        supports_vision: true,
      },
    ],
  };
  return { codexCatalog, configuration, repository: makeRepository(configuration) };

  /** The live catalog: gpt-5.6-luna reports its own reasoning levels. */
  function codexCatalog() {
    return {
      authoritative: 'live_handshake',
      providers: [
        {
          id: 'codex',
          name: 'Codex (subscription)',
          models: [
            {
              model_id: 'gpt-5.6-luna',
              reasoning: {
                supported: true,
                parameter: '',
                levels: ['low', 'medium', 'high', 'xhigh'],
                default: 'medium',
              },
            },
          ],
        },
      ],
    };
  }

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
        source: 'codex_catalog',
      }),
      refreshProviderModels: vi.fn().mockResolvedValue([
        {
          provider: 'codex',
          discovered: [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' }],
          source: 'codex_catalog',
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
        source: 'codex_catalog',
        connectivity: 'ok',
        auth: 'ok',
        latency_ms: 18.4,
        generated_at: '2026-08-23T05:00:00Z',
      }),
      installProviderSupport: vi.fn().mockResolvedValue({
        provider_id: 'claude_code',
        installed: true,
        instructions: 'installed',
      }),
      authenticateProvider: vi.fn(),
      completeProviderAuthentication: vi.fn(),
      providerAuthStatus: vi.fn().mockResolvedValue({ state: 'pending', reason: '' }),
      logoutProvider: vi.fn().mockResolvedValue({ is_authenticated: false, instructions: 'Signed out.' }),
      updateLanguageModelConfiguration: vi.fn(),
      saveProviderApiKey: vi.fn(),
      clearProviderApiKey: vi.fn(),
      providerCatalog: vi.fn().mockResolvedValue(codexCatalog()),
    };
  }
});

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

afterEach(() => {
  cleanup();
  useLiveStore.getState().reset();
  vi.clearAllMocks();
  repository.languageModelConfiguration.mockReset().mockResolvedValue(configuration);
  repository.providerModels.mockReset().mockResolvedValue({
    provider_id: 'codex',
    models: [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' }],
    source: 'codex_catalog',
  });
  repository.updateLanguageModelConfiguration.mockReset();
  repository.providerCatalog.mockReset().mockResolvedValue(codexCatalog());
});

describe('ModelsSettings', () => {
  it('does not allow unverified Codex credentials to be applied', async () => {
    repository.languageModelConfiguration.mockResolvedValueOnce({
      configured: false,
      provider: '',
      api_base: '',
      model: '',
      thinking_level: 'medium',
      presets: [
        {
          id: 'codex',
          label: 'Codex',
          provider: 'codex',
          api_base: 'codex://direct',
          suggested_model: '',
          requires_api_key: false,
          auth_method: 'subscription',
          is_authenticated: false,
          status: 'auth_check_required',
          status_message: 'Codex credentials are present but have not been validated',
          supports_live_catalog: false,
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

    expect(await screen.findByRole('button', { name: 'Apply provider and model' })).toBeDisabled();
    expect(screen.getAllByText('Not checked')).not.toHaveLength(0);
  });

  it('preserves the authoritative configured model when opened for its provider', async () => {
    repository.languageModelConfiguration.mockResolvedValueOnce({
      configured: true,
      provider_id: 'codex',
      provider: 'codex',
      api_base: 'codex://direct',
      model: 'gpt-5.6-luna',
      thinking_level: 'medium',
      presets: [
        {
          id: 'codex',
          label: 'Codex',
          provider: 'codex',
          api_base: 'codex://direct',
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
      'codex://direct',
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
    await user.click(await screen.findByRole('button', { name: 'Refresh models' }));
    await waitFor(() => expect(repository.refreshProviderModels).toHaveBeenCalledWith(['codex']));
    expect(await screen.findByText('Catalog refreshed')).toBeVisible();
    expect(screen.getByText(/1 available model, 0 added, 0 removed/)).toBeVisible();
    expect(screen.getByText(/Checked .* by the connected agent/)).toBeVisible();
    expect(screen.queryByText(/codex_catalog/)).not.toBeInTheDocument();
  });

  it('does not let an unverified catalog candidate become an applied model', async () => {
    repository.providerModels.mockResolvedValueOnce({
      provider_id: 'codex',
      models: [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna', availability: 'candidate' }],
      source: 'github_catalog',
    });
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

    expect(await screen.findByRole('combobox', { name: 'Model' })).toHaveTextContent(
      'gpt-5.6-luna',
    );
    expect(screen.getByRole('button', { name: 'Apply provider and model' })).toBeDisabled();
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
      source: 'codex_catalog',
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
      provider_id: 'codex',
      provider_options: {},
      api_base: '',
      model: 'gpt-5.6-nova',
    });
  });

  it('retires stale session and provider catalog state after applying a model', async () => {
    const endpoint = 'http://127.0.0.1:8787';
    const staleSession = {
      id: 'session-1',
      workspace_id: 'workspace-1',
      title: 'Existing conversation',
      state: 'completed',
      created_at: '2026-09-21T00:00:00Z',
      updated_at: '2026-09-21T00:00:00Z',
      provider_id: 'codex',
      model_id: 'gpt-5.6-luna',
      mode: 'edit',
      edit_mode: 'diff',
      routing_mode: 'auto',
      approval_mode: 'ask',
      pinned: false,
      archived: false,
    } as const;
    const claudePreset = {
      id: 'claude_code',
      label: 'Claude Code',
      provider: 'claude_code',
      suggested_model: 'sonnet',
      requires_api_key: false,
      is_authenticated: true,
      supports_live_catalog: true,
      supports_vision: true,
    };
    const selectableConfiguration = {
      ...configuration,
      presets: [...configuration.presets, claudePreset],
    };
    const nextConfiguration = {
      ...selectableConfiguration,
      provider: 'claude_code',
      model: 'sonnet',
    };
    repository.languageModelConfiguration.mockResolvedValueOnce(selectableConfiguration);
    repository.providerModels.mockImplementation(async (providerId: string) => ({
      provider_id: providerId,
      models:
        providerId === 'claude_code'
          ? [{ id: 'sonnet', name: 'Claude Sonnet' }]
          : [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' }],
      source: `${providerId}_catalog`,
    }));
    repository.updateLanguageModelConfiguration.mockResolvedValueOnce(nextConfiguration);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(queryKeys.sessions(endpoint, 'workspace-1'), [staleSession]);
    queryClient.setQueryData(queryKeys.providerCatalog(endpoint), {
      authoritative: 'live_handshake',
      providers: [],
    });
    useLiveStore.getState().replaceSnapshots({ sessions: { [staleSession.id]: staleSession } });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ModelsSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('combobox', { name: 'Provider' }));
    await user.click(await screen.findByRole('option', { name: 'Claude Code' }));
    expect(await screen.findByRole('combobox', { name: 'Model' })).toHaveTextContent(
      'Claude Sonnet',
    );
    const catalogReadsBeforeApply = repository.providerCatalog.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Apply provider and model' }));

    await waitFor(() =>
      expect(repository.updateLanguageModelConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'claude_code', model: 'sonnet' }),
      ),
    );
    const cachedSession = queryClient.getQueryData<(typeof staleSession)[]>(
      queryKeys.sessions(endpoint, 'workspace-1'),
    )?.[0];
    expect(cachedSession?.provider_id).toBeUndefined();
    expect(cachedSession?.model_id).toBeUndefined();
    expect(useLiveStore.getState().entities.sessions[staleSession.id]?.provider_id).toBeUndefined();
    expect(useLiveStore.getState().entities.sessions[staleSession.id]?.model_id).toBeUndefined();
    // The panel itself watches the catalog, so retiring it re-reads it at once.
    await waitFor(() =>
      expect(repository.providerCatalog.mock.calls.length).toBeGreaterThan(catalogReadsBeforeApply),
    );
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

  it('offers only the reasoning levels the selected model reports', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ModelsSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('combobox', { name: 'Reasoning effort' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Model default (Medium)',
      'Low',
      'Medium',
      'High',
      'Extra high',
    ]);
  });

  it('shows no reasoning selector for a model that reports no levels', async () => {
    repository.providerCatalog.mockResolvedValue({
      authoritative: 'live_handshake',
      providers: [
        {
          id: 'codex',
          name: 'Codex (subscription)',
          models: [
            {
              model_id: 'gpt-5.6-luna',
              reasoning: { supported: false, parameter: '', levels: [] },
            },
          ],
        },
      ],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ModelsSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('combobox', { name: 'Model' })).toBeVisible();
    await waitFor(() => expect(repository.providerCatalog).toHaveBeenCalled());
    expect(screen.queryByRole('combobox', { name: 'Reasoning effort' })).not.toBeInTheDocument();
  });
});
