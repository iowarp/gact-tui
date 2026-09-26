import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { useLiveStore } from '@/store/live-store';
import { catalog, catalogEntry, codexCatalog } from '@/test-fixtures/provider-catalog';
import { ModelsSettings } from './settings-models';

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
      providerCatalog: vi.fn(),
    };
  }
});

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

beforeEach(() => {
  repository.providerCatalog.mockResolvedValue(codexCatalog());
});

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

function renderModels(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ModelsSettings />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return queryClient;
}

/** Every label a stacked form row would carry: none may appear on the main view. */
const TECHNICAL_WORDS = /Endpoint|Configuration|Credentials|Catalog|Handshake|Probe|Parallel/iu;

describe('ModelsSettings', () => {
  it('shows the default model as one card: name, provider, working state, capability tags', async () => {
    renderModels();

    expect(await screen.findByText('gpt-5.6-luna', { selector: '[data-slot="default-model-name"]' })).toBeVisible();
    const panel = document.querySelector('[data-slot="default-model-card"]') as HTMLElement;
    expect(within(panel).getByText('Codex')).toBeVisible();
    expect(await within(panel).findByText('Working')).toBeVisible();
    expect(await within(panel).findByText('Reasoning')).toBeVisible();
    expect(within(panel).getByRole('button', { name: 'Change' })).toBeVisible();
    // No stacked form rows on the main view: no selects, no endpoint, no temperature.
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(TECHNICAL_WORDS)).toBeNull();
    expect(screen.queryByText('Temperature')).toBeNull();
  });

  it('offers the thinking level as a segmented control over exactly the reported levels', async () => {
    renderModels();

    await screen.findByRole('radio', { name: 'High' });
    const group = document.querySelector('[data-slot="reasoning-level"]') as HTMLElement;
    expect(group).toHaveAccessibleName('Thinking');
    expect(within(group).getAllByRole('radio').map((item) => item.textContent)).toEqual([
      'Default',
      'Low',
      'Medium',
      'High',
      'Extra high',
    ]);
  });

  it('applies a thinking level as soon as it is chosen, writing only the level', async () => {
    repository.updateLanguageModelConfiguration.mockResolvedValueOnce({
      ...configuration,
      thinking_level: 'high',
      thinking_level_source: 'user',
    });
    const user = userEvent.setup();
    renderModels();

    await user.click(await screen.findByRole('radio', { name: 'High' }));

    await waitFor(() =>
      expect(repository.updateLanguageModelConfiguration).toHaveBeenCalledWith({
        provider: 'codex',
        provider_id: 'codex',
        provider_options: {},
        api_base: '',
        model: 'gpt-5.6-luna',
        thinking_level: 'high',
      }),
    );
  });

  it('shows no thinking control for a model that reports no levels', async () => {
    repository.providerCatalog.mockResolvedValue({
      authoritative: 'live_handshake',
      providers: [
        catalogEntry('codex', [
          { model_id: 'gpt-5.6-luna', reasoning: { supported: false, parameter: '', levels: [] } },
        ]),
      ],
    });
    renderModels();

    expect(await screen.findByRole('button', { name: 'Change' })).toBeVisible();
    await waitFor(() => expect(repository.providerCatalog).toHaveBeenCalled());
    expect(document.querySelector('[data-slot="reasoning-level"]')).toBeNull();
  });

  it('keeps the rare response settings behind a quiet disclosure; temperature starts blank', async () => {
    repository.languageModelConfiguration.mockResolvedValue({ ...configuration, temperature: 0 });
    const user = userEvent.setup();
    renderModels();

    const disclosure = await screen.findByRole('button', { name: 'Response settings' });
    expect(screen.queryByLabelText('Temperature')).toBeNull();
    await user.click(disclosure);

    const temperature = await screen.findByRole('textbox', { name: 'Temperature' });
    expect(temperature).toHaveValue('');
    expect(temperature).toHaveAttribute('placeholder', 'Provider default');
    // A hosted provider has no local sizing or address.
    expect(screen.queryByLabelText('Server address')).toBeNull();
    expect(screen.queryByLabelText('Replies at once')).toBeNull();
  });

  it('never writes a response setting the person did not change', async () => {
    repository.updateLanguageModelConfiguration.mockResolvedValueOnce(configuration);
    const user = userEvent.setup();
    renderModels();

    await user.click(await screen.findByRole('button', { name: 'Response settings' }));
    const temperature = await screen.findByRole('textbox', { name: 'Temperature' });
    await user.type(temperature, '0.4');
    await user.tab();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(repository.updateLanguageModelConfiguration).toHaveBeenCalled());
    const payload = repository.updateLanguageModelConfiguration.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ temperature: 0.4 });
    expect(payload).not.toHaveProperty('max_tokens');
    expect(payload).not.toHaveProperty('thinking_level');
  });

  it('a local runtime also gets its sizing and address in the disclosure', async () => {
    repository.languageModelConfiguration.mockResolvedValue({
      ...configuration,
      provider_id: 'vllm',
      provider: 'openai',
      api_base: 'http://127.0.0.1:8000/v1',
      model: 'qwen',
      presets: [
        ...configuration.presets,
        {
          id: 'vllm',
          label: 'vLLM',
          provider: 'openai',
          provider_id: 'vllm',
          api_base: 'http://127.0.0.1:8000/v1',
          suggested_model: 'qwen',
          requires_api_key: false,
          auth_method: 'none',
          is_authenticated: true,
          supports_live_catalog: true,
          supports_vision: false,
        },
      ],
    });
    const user = userEvent.setup();
    renderModels();

    await user.click(await screen.findByRole('button', { name: 'Response settings' }));
    expect(await screen.findByLabelText('Server address')).toHaveValue('http://127.0.0.1:8000/v1');
    expect(screen.getByRole('textbox', { name: 'Replies at once' })).toBeVisible();
  });

  it('a provider that needs setup reads so on the card, and Change is where it is fixed', async () => {
    repository.providerCatalog.mockResolvedValue({ authoritative: 'live_handshake', providers: [] });
    repository.languageModelConfiguration.mockResolvedValue({
      ...configuration,
      presets: configuration.presets.map((preset) => ({
        ...preset,
        is_authenticated: false,
        status: 'auth_required',
      })),
    });
    renderModels();

    const card = (await screen.findByRole('button', { name: 'Change' })).closest(
      '[data-slot="default-model-card"]',
    ) as HTMLElement;
    const status = card.querySelector('[data-slot="default-model-status"]');
    await waitFor(() => expect(status).not.toHaveTextContent('Working'));
    expect(status?.textContent).toMatch(/Unavailable|Needs sign-in/u);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('choosing a model in the picker applies it and retires stale session state', async () => {
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
    repository.providerCatalog.mockResolvedValue(
      catalog(
        catalogEntry('codex', [{ model_id: 'gpt-5.6-luna' }, { model_id: 'gpt-5.6-sol' }]),
      ),
    );
    repository.updateLanguageModelConfiguration.mockResolvedValueOnce({
      ...configuration,
      model: 'gpt-5.6-sol',
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(queryKeys.sessions(endpoint, 'workspace-1'), [staleSession]);
    useLiveStore.getState().replaceSnapshots({ sessions: { [staleSession.id]: staleSession } });
    const user = userEvent.setup();
    renderModels(queryClient);

    await user.click(await screen.findByRole('button', { name: 'Change' }));
    await user.click(await screen.findByRole('option', { name: /gpt-5\.6-sol/ }));

    await waitFor(() =>
      expect(repository.updateLanguageModelConfiguration).toHaveBeenCalledWith({
        provider: 'codex',
        provider_id: 'codex',
        provider_options: {},
        api_base: '',
        model: 'gpt-5.6-sol',
      }),
    );
    await waitFor(() =>
      expect(useLiveStore.getState().entities.sessions[staleSession.id]?.model_id).toBeUndefined(),
    );
  });

  it('adopts a configuration the service changed', async () => {
    const queryClient = renderModels();
    expect(
      await screen.findByText('gpt-5.6-luna', { selector: '[data-slot="default-model-name"]' }),
    ).toBeVisible();

    act(() => {
      queryClient.setQueryData(
        queryKeys.key('language-model-configuration', 'http://127.0.0.1:8787'),
        { ...configuration, model: 'gpt-5.5' },
      );
    });

    expect(
      await screen.findByText('gpt-5.5', { selector: '[data-slot="default-model-name"]' }),
    ).toBeVisible();
  });
});
