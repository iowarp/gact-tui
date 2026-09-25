import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { catalog, catalogEntry, codexCatalog } from '@/test-fixtures/provider-catalog';
import { ProvidersSettings } from './settings-providers';

const { configuration, repository } = vi.hoisted(() => {
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
  const repository = {
    languageModelConfiguration: vi.fn(),
    providerModels: vi.fn(),
    refreshProviderModels: vi.fn(),
    providerHandshake: vi.fn(),
    installProviderSupport: vi.fn(),
    authenticateProvider: vi.fn(),
    completeProviderAuthentication: vi.fn(),
    providerAuthStatus: vi.fn(),
    logoutProvider: vi.fn(),
    updateLanguageModelConfiguration: vi.fn(),
    saveProviderApiKey: vi.fn(),
    clearProviderApiKey: vi.fn(),
    providerCatalog: vi.fn(),
  };
  return { configuration, repository };
});

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

beforeEach(() => {
  repository.languageModelConfiguration.mockResolvedValue(configuration);
  repository.providerCatalog.mockResolvedValue(codexCatalog());
  repository.providerModels.mockResolvedValue({
    provider_id: 'codex',
    models: [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' }],
    source: 'codex_catalog',
  });
  repository.providerHandshake.mockResolvedValue({
    models: [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' }],
    source: 'codex_catalog',
    connectivity: 'ok',
    auth: 'ok',
    latency_ms: 18.4,
    generated_at: '2026-08-23T05:00:00Z',
  });
  repository.installProviderSupport.mockResolvedValue({
    provider_id: 'claude_code',
    installed: true,
    instructions: 'installed',
  });
  repository.providerAuthStatus.mockResolvedValue({ state: 'pending', reason: '' });
  repository.logoutProvider.mockResolvedValue({ is_authenticated: false, instructions: 'Signed out.' });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function renderProviders(providerId?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter
      initialEntries={[providerId ? `/settings/providers?provider=${providerId}` : '/settings/providers']}
    >
      <QueryClientProvider client={queryClient}>
        <ProvidersSettings />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return queryClient;
}

const alcfPreset = {
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
};

function withPresets(...presets: Array<Record<string, unknown>>) {
  return { ...configuration, presets };
}

describe('ProvidersSettings provider actions', () => {
  it('offers Claude Code installation instead of claiming the provider is ready', async () => {
    repository.languageModelConfiguration.mockResolvedValue(
      withPresets({
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
      }),
    );
    repository.providerCatalog.mockResolvedValue(catalog());
    const user = userEvent.setup();
    renderProviders('claude_code');

    const install = await screen.findByRole('button', { name: 'Install' });
    expect(screen.getByText('Install needed')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Verify provider' })).not.toBeInTheDocument();
    await user.click(install);
    await waitFor(() => expect(repository.installProviderSupport).toHaveBeenCalledWith('claude_code'));
    expect(repository.providerHandshake).toHaveBeenCalledWith('claude_code', {
      apiBase: 'claude-code://sdk',
      refresh: true,
    });
  });

  it('completes ALCF login in-app without asking for a terminal command', async () => {
    repository.languageModelConfiguration.mockResolvedValue(withPresets(alcfPreset));
    repository.providerCatalog.mockResolvedValue(catalog());
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
    const open = vi.spyOn(window, 'open').mockImplementation(() => window);
    const user = userEvent.setup();
    renderProviders('argonne_metis');

    // The sign-in service is availability state, never part of the name.
    expect(await screen.findByText('Missing (Globus Auth)')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'ALCF Metis' })).toBeVisible();
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

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
    await waitFor(() =>
      expect(screen.queryByLabelText('Complete ALCF Metis sign-in')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(/interactive terminal|python -m/i)).not.toBeInTheDocument();
    // The service retired ALCF's catalog entry; the panel re-reads exactly that
    // provider and hands the result to every open model picker.
    await waitFor(() =>
      expect(repository.providerCatalog).toHaveBeenCalledWith(false, undefined, 'argonne_metis'),
    );
  });

  it('signs out of ALCF, revoking the stored Globus token', async () => {
    repository.languageModelConfiguration.mockResolvedValue(
      withPresets({ ...alcfPreset, is_authenticated: true, status: 'ready', supports_logout: true }),
    );
    repository.providerCatalog.mockResolvedValue(
      catalog(catalogEntry('argonne_metis', [{ model_id: 'gpt-oss-120b' }])),
    );
    const user = userEvent.setup();
    renderProviders('argonne_metis');

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(repository.logoutProvider).toHaveBeenCalledWith('argonne_metis'));
  });

  it('ALCF needing re-authentication shows ONE "Sign in again" action and never the raw Globus text', async () => {
    repository.languageModelConfiguration.mockResolvedValue(
      withPresets({
        ...alcfPreset,
        // The token still looks valid -- ALCF's OWN policy rejected it.
        is_authenticated: true,
        status: undefined,
        status_message:
          'argonne_reauthentication_required: Error: Permission denied from internal ' +
          'policies. This is likely due to a high-assurance timeout. Please logout at ' +
          'https://globus.org/logout and re-authenticate.',
      }),
    );
    repository.providerCatalog.mockResolvedValue(catalog());
    const user = userEvent.setup();
    renderProviders('argonne_metis');

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
    repository.languageModelConfiguration.mockResolvedValue(
      withPresets({ ...configuration.presets[0], is_authenticated: false }),
    );
    repository.providerCatalog.mockResolvedValue(catalog());
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
    renderProviders('codex');

    await user.click(await screen.findByRole('button', { name: 'Device code' }));
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
    // The running flow's stage turns the heartbeat yellow on the list AND the panel.
    const heartbeats = document.querySelectorAll('[data-slot="provider-heartbeat"][data-state="checking"]');
    expect(heartbeats).toHaveLength(2);
  });

  it('signs out of Codex through the backend', async () => {
    const user = userEvent.setup();
    renderProviders('codex');

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(repository.logoutProvider).toHaveBeenCalledWith('codex'));
  });

  it('removes a saved API key and shows only Verify, Refresh and Remove key for a ready key provider', async () => {
    repository.languageModelConfiguration.mockResolvedValue({
      ...withPresets({
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
      }),
      provider_id: 'openai',
      provider: 'openai',
      api_base: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    });
    repository.providerCatalog.mockResolvedValue(
      catalog(catalogEntry('openai', [{ model_id: 'gpt-4o-mini' }])),
    );
    repository.updateLanguageModelConfiguration.mockResolvedValueOnce({
      configured: false,
      provider_id: 'openai',
      provider: 'openai',
      api_base: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    });
    renderProviders('openai');

    expect(await screen.findByRole('button', { name: 'Verify provider' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refresh models' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Remove key' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('OpenAI API key')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Remove key' }));
    await waitFor(() =>
      expect(repository.updateLanguageModelConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({ provider_id: 'openai', provider: 'openai', api_key: '' }),
      ),
    );
  });

  it('shows the sign-in failure reason when a flow ends in failure', async () => {
    repository.languageModelConfiguration.mockResolvedValue(
      withPresets({ ...configuration.presets[0], is_authenticated: false }),
    );
    repository.providerCatalog.mockResolvedValue(catalog());
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
    renderProviders('codex');

    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(
      await screen.findByText('The redirect state did not match this sign-in attempt.'),
    ).toBeVisible();
  });

  it('verifies a provider without touching the model configuration', async () => {
    const user = userEvent.setup();
    renderProviders();

    await user.click(await screen.findByRole('button', { name: 'Verify provider' }));
    await waitFor(() =>
      expect(repository.providerHandshake).toHaveBeenCalledWith('codex', {
        apiBase: '',
        refresh: true,
      }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Verify provider' })).toBeEnabled());
    expect(screen.queryByText(/codex_catalog/)).not.toBeInTheDocument();
    expect(repository.updateLanguageModelConfiguration).not.toHaveBeenCalled();
  });

  it('re-reads the checked provider catalog entry and shares it with open pickers', async () => {
    const checked = catalog(catalogEntry('codex', [], { name: 'Codex (subscription)' }));
    repository.providerCatalog.mockImplementation(
      async (_refresh: boolean, _signal: unknown, providerId?: string) =>
        providerId ? checked : codexCatalog(),
    );
    const user = userEvent.setup();
    const queryClient = renderProviders();

    await user.click(await screen.findByRole('button', { name: 'Verify provider' }));
    await waitFor(() =>
      // The check's own handshake is the fresh evidence: a plain read of this
      // provider's entry, never a second live probe (`refresh=true`).
      expect(repository.providerCatalog).toHaveBeenCalledWith(false, undefined, 'codex'),
    );
    await waitFor(() =>
      expect(queryClient.getQueryData(queryKeys.providerCatalog('http://127.0.0.1:8787'))).toEqual(
        checked,
      ),
    );
  });
});
