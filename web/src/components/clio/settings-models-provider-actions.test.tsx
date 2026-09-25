import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
        supports_logout: true,
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


describe('ModelsSettings provider actions', () => {
  it('offers Claude Code installation instead of claiming the provider is ready', async () => {
    repository.languageModelConfiguration.mockResolvedValueOnce({
      configured: false,
      provider: '',
      api_base: '',
      model: '',
      thinking_level: 'medium',
      presets: [
        {
          id: 'claude_code',
          label: 'Claude Code',
          provider: 'claude_code',
          api_base: 'claude-code://sdk',
          suggested_model: '',
          requires_api_key: false,
          auth_method: 'subscription',
          is_authenticated: false,
          status: 'install_required',
          status_message: 'Claude Code support is not installed on the connected agent.',
          supports_live_catalog: false,
          supports_vision: true,
        },
      ],
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/settings/providers?provider=claude_code']}>
        <QueryClientProvider client={queryClient}>
          <ModelsSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const install = await screen.findByRole('button', { name: 'Install Claude Code' });
    expect(screen.getByRole('button', { name: 'Apply provider and model' })).toBeDisabled();
    expect(screen.getAllByText('Install needed')).not.toHaveLength(0);
    await user.click(install);
    await waitFor(() =>
      expect(repository.installProviderSupport).toHaveBeenCalledWith('claude_code'),
    );
    expect(repository.providerHandshake).toHaveBeenCalledWith('claude_code', {
      apiBase: 'claude-code://sdk',
      refresh: true,
    });
  });

  it('completes ALCF login in-app without asking for a terminal command', async () => {
    const alcfConfiguration = {
      configured: false,
      provider: 'argonne',
      api_base: 'https://inference-api.alcf.anl.gov/resource_server/metis/api/v1',
      model: 'gpt-oss-120b',
      presets: [
        {
          id: 'argonne_metis',
          label: 'ALCF Metis',
          provider: 'argonne',
          api_base: 'https://inference-api.alcf.anl.gov/resource_server/metis/api/v1',
          suggested_model: 'gpt-oss-120b',
          requires_api_key: false,
          is_authenticated: false,
          auth_method: 'oauth',
          auth_label: 'Globus Auth',
          status: 'auth_required',
          supports_live_catalog: true,
          supports_vision: false,
        },
      ],
    };
    repository.languageModelConfiguration.mockResolvedValueOnce(alcfConfiguration);
    repository.languageModelConfiguration.mockResolvedValueOnce({
      ...alcfConfiguration,
      presets: alcfConfiguration.presets.map((preset) => ({
        ...preset,
        is_authenticated: true,
        status: 'ready',
      })),
    });
    repository.authenticateProvider.mockResolvedValueOnce({
      provider_id: 'argonne_metis',
      flow_id: 'flow-123',
      browser: {
        authorization_url: 'https://auth.globus.org/v2/oauth2/authorize?state=test',
        loopback: false,
      },
      instructions: 'Continue in Globus, then paste the authorization code here.',
    });
    repository.completeProviderAuthentication.mockResolvedValueOnce({
      provider_id: 'argonne_metis',
      is_authenticated: true,
      instructions: 'ALCF sign-in complete. Available models are refreshing.',
    });
    repository.providerAuthStatus.mockResolvedValue({
      provider_id: 'argonne_metis',
      state: 'pending',
      reason: '',
    });
    const open = vi.spyOn(window, 'open').mockImplementation(() => window);
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={['/settings/providers?provider=argonne_metis']}>
        <QueryClientProvider client={queryClient}>
          <ModelsSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    // The sign-in service is detail beside the action, never part of the name.
    expect(await screen.findByText('Uses Globus Auth')).toBeVisible();
    await user.click(await screen.findByRole('button', { name: 'Sign in to ALCF Metis' }));

    await waitFor(() =>
      expect(repository.authenticateProvider).toHaveBeenCalledWith('argonne_metis', {
        force: true,
        method: 'browser',
      }),
    );
    expect(open).toHaveBeenCalledWith(
      'https://auth.globus.org/v2/oauth2/authorize?state=test',
      '_blank',
      'noopener,noreferrer',
    );
    expect(await screen.findByLabelText('Complete ALCF Metis sign-in')).toBeVisible();
    await user.type(screen.getByLabelText('Redirect URL or code'), 'globus-code');
    await user.click(screen.getByRole('button', { name: 'Complete sign-in' }));
    await waitFor(() =>
      expect(repository.completeProviderAuthentication).toHaveBeenCalledWith('argonne_metis', {
        flowId: 'flow-123',
        paste: 'globus-code',
      }),
    );
    expect(await screen.findByText(/ALCF sign-in complete/)).toBeVisible();
    expect(screen.queryByText(/interactive terminal|python -m/i)).not.toBeInTheDocument();
    // The service retired ALCF's catalog entry; the panel re-reads exactly that
    // provider live and hands the result to every open model picker.
    await waitFor(() =>
      expect(repository.providerCatalog).toHaveBeenCalledWith(true, undefined, 'argonne_metis'),
    );
  });

  it('signs out of ALCF, revoking the stored Globus token', async () => {
    const alcfReadyConfiguration = {
      configured: true,
      provider_id: 'argonne_metis',
      provider: 'argonne',
      api_base: 'https://inference-api.alcf.anl.gov/resource_server/metis/api/v1',
      model: 'gpt-oss-120b',
      presets: [
        {
          id: 'argonne_metis',
          label: 'ALCF Metis',
          provider: 'argonne',
          api_base: 'https://inference-api.alcf.anl.gov/resource_server/metis/api/v1',
          suggested_model: 'gpt-oss-120b',
          requires_api_key: false,
          is_authenticated: true,
          auth_method: 'oauth',
          auth_label: 'Globus Auth',
          status: 'ready',
          supports_live_catalog: true,
          supports_vision: false,
          supports_logout: true,
        },
      ],
    };
    repository.languageModelConfiguration.mockResolvedValue(alcfReadyConfiguration);
    repository.logoutProvider.mockResolvedValueOnce({
      is_authenticated: false,
      instructions: 'Signed out of ALCF.',
    });
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={['/settings/providers?provider=argonne_metis']}>
        <QueryClientProvider client={queryClient}>
          <ModelsSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(repository.logoutProvider).toHaveBeenCalledWith('argonne_metis'));
    expect(await screen.findByText('Signed out of ALCF.')).toBeVisible();
  });

  it('ALCF needing re-authentication shows ONE "Sign in again" action and never the raw Globus text', async () => {
    repository.languageModelConfiguration.mockResolvedValue({
      configured: true,
      provider_id: 'argonne_metis',
      provider: 'argonne',
      api_base: 'https://inference-api.alcf.anl.gov/resource_server/metis/api/v1',
      model: 'gpt-oss-120b',
      presets: [
        {
          id: 'argonne_metis',
          label: 'ALCF Metis',
          provider: 'argonne',
          api_base: 'https://inference-api.alcf.anl.gov/resource_server/metis/api/v1',
          suggested_model: 'gpt-oss-120b',
          requires_api_key: false,
          // The Globus token itself still looks valid -- ALCF's OWN policy
          // rejected it (a "high-assurance timeout"), so `is_authenticated`
          // alone would wrongly suggest the ready-state buttons apply.
          is_authenticated: true,
          auth_method: 'oauth',
          auth_label: 'Globus Auth',
          status_message:
            'argonne_reauthentication_required: Error: Permission denied from internal ' +
            'policies. This is likely due to a high-assurance timeout. Please logout at ' +
            'https://globus.org/logout and re-authenticate.',
          supports_live_catalog: true,
          supports_vision: false,
        },
      ],
    });
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={['/settings/providers?provider=argonne_metis']}>
        <QueryClientProvider client={queryClient}>
          <ModelsSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Sign in again' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Verify provider' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh models' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.queryByText(/globus\.org\/logout/)).not.toBeInTheDocument();
    expect(screen.queryByText(/high-assurance timeout/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign in again' }));
    await waitFor(() =>
      expect(repository.authenticateProvider).toHaveBeenCalledWith('argonne_metis', {
        force: true,
        method: 'browser',
      }),
    );
  });

  it('signs in to Codex with a device code and shows it while waiting', async () => {
    repository.languageModelConfiguration.mockResolvedValueOnce({
      ...configuration,
      presets: configuration.presets.map((preset) => ({ ...preset, is_authenticated: false })),
    });
    repository.authenticateProvider.mockResolvedValueOnce({
      provider_id: 'codex',
      flow_id: 'flow-device-1',
      device: {
        user_code: 'ABCD-1234',
        verification_url: 'https://chatgpt.com/codex/device',
        interval: 5,
      },
      instructions: 'Enter code ABCD-1234 at https://chatgpt.com/codex/device.',
    });
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={['/settings/providers?provider=codex']}>
        <QueryClientProvider client={queryClient}>
          <ModelsSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Sign in with a device code' }));
    await waitFor(() =>
      expect(repository.authenticateProvider).toHaveBeenCalledWith('codex', {
        force: true,
        method: 'device',
      }),
    );
    expect(await screen.findByText('ABCD-1234')).toBeVisible();
    expect(screen.getByRole('link', { name: /Open verification page/ })).toHaveAttribute(
      'href',
      'https://chatgpt.com/codex/device',
    );
    expect(screen.getByText(/Waiting for sign-in to finish/)).toBeVisible();
  });

  it('signs out of Codex and clears the credential', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={['/settings/providers?provider=codex']}>
        <QueryClientProvider client={queryClient}>
          <ModelsSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(repository.logoutProvider).toHaveBeenCalledWith('codex'));
    expect(await screen.findByText('Signed out.')).toBeVisible();
  });

  it('removes a saved API key and shows only Verify, Refresh and Remove key for a ready key provider', async () => {
    repository.languageModelConfiguration.mockResolvedValueOnce({
      configured: true,
      provider_id: 'openai',
      provider: 'openai',
      api_base: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      thinking_level: 'medium',
      presets: [
        {
          id: 'openai',
          label: 'OpenAI',
          provider: 'openai',
          api_base: 'https://api.openai.com/v1',
          suggested_model: 'gpt-4o-mini',
          requires_api_key: true,
          auth_method: 'api_key',
          is_authenticated: true,
          supports_live_catalog: true,
          supports_vision: true,
        },
      ],
    });
    repository.updateLanguageModelConfiguration.mockResolvedValueOnce({
      configured: false,
      provider_id: 'openai',
      provider: 'openai',
      api_base: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      thinking_level: 'medium',
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={['/settings/providers?provider=openai']}>
        <QueryClientProvider client={queryClient}>
          <ModelsSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    // The state-exact action set for a ready, API-key-authenticated provider:
    // Verify + Refresh + Remove key -- never Sign in, Install or the key field.
    expect(await screen.findByRole('button', { name: 'Verify provider' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refresh models' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Remove key' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Install/ })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Remove key' }));

    await waitFor(() =>
      expect(repository.updateLanguageModelConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({
          provider_id: 'openai',
          provider: 'openai',
          api_key: '',
        }),
      ),
    );
  });

  it('shows the sign-in failure reason when a flow ends in failure', async () => {
    repository.languageModelConfiguration.mockResolvedValueOnce({
      ...configuration,
      presets: configuration.presets.map((preset) => ({ ...preset, is_authenticated: false })),
    });
    repository.authenticateProvider.mockResolvedValueOnce({
      provider_id: 'codex',
      flow_id: 'flow-fails',
      browser: { authorization_url: 'https://auth.openai.com/oauth/authorize?x=1', loopback: true },
      instructions: 'Open the link to sign in.',
    });
    repository.providerAuthStatus.mockResolvedValue({
      provider_id: 'codex',
      state: 'failed',
      reason: 'The redirect state did not match this sign-in attempt.',
    });
    vi.spyOn(window, 'open').mockImplementation(() => window);
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={['/settings/providers?provider=codex']}>
        <QueryClientProvider client={queryClient}>
          <ModelsSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Sign in to Codex' }));
    expect(
      await screen.findByText('The redirect state did not match this sign-in attempt.'),
    ).toBeVisible();
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

    await user.click(await screen.findByRole('button', { name: 'Verify provider' }));
    await waitFor(() =>
      expect(repository.providerHandshake).toHaveBeenCalledWith('codex', {
        apiBase: '',
        refresh: true,
      }),
    );
    expect(await screen.findByText('Provider ready')).toBeVisible();
    expect(screen.getByText(/Connection ok, sign-in ok, 1 model/)).toBeVisible();
    expect(screen.getByText(/Checked .* in 18 ms/)).toBeVisible();
    expect(screen.queryByText(/codex_catalog/)).not.toBeInTheDocument();
    expect(repository.updateLanguageModelConfiguration).not.toHaveBeenCalled();
  });

  it('re-reads the checked provider catalog live and shares it with open pickers', async () => {
    const catalog = {
      authoritative: 'live_handshake',
      providers: [{ id: 'codex', name: 'Codex (subscription)', models: [] }],
    };
    repository.providerCatalog.mockImplementation(async (refresh: boolean) =>
      refresh ? catalog : codexCatalog(),
    );
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ModelsSettings />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Verify provider' }));

    await waitFor(() =>
      expect(repository.providerCatalog).toHaveBeenCalledWith(true, undefined, 'codex'),
    );
    await waitFor(() =>
      expect(queryClient.getQueryData(queryKeys.providerCatalog('http://127.0.0.1:8787'))).toEqual(
        catalog,
      ),
    );
  });
});
