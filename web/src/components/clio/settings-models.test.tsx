import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { useLiveStore } from '@/store/live-store';
import {
  acceptedParameter,
  catalog,
  catalogEntry,
  codexCatalog,
} from '@/test-fixtures/provider-catalog';
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
      logoutProvider: vi
        .fn()
        .mockResolvedValue({ is_authenticated: false, instructions: 'Signed out.' }),
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

function renderModels(
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
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

    expect(
      await screen.findByText('gpt-5.6-luna', { selector: '[data-slot="default-model-name"]' }),
    ).toBeVisible();
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
    expect(
      within(group)
        .getAllByRole('radio')
        .map((item) => item.textContent),
    ).toEqual(['Default', 'Low', 'Medium', 'High', 'Extra high']);
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

  it('ends Saving when the write succeeds while catalog refresh is still pending', async () => {
    let completeWrite!: (configuration: unknown) => void;
    repository.updateLanguageModelConfiguration.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeWrite = resolve;
        }),
    );
    const user = userEvent.setup();
    const queryClient = renderModels();
    await screen.findByRole('radio', { name: 'High' });
    let completeCatalog!: (value: unknown) => void;
    repository.providerCatalog.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeCatalog = resolve;
        }),
    );
    await user.click(screen.getByRole('radio', { name: 'High' }));
    expect(screen.getByText('Saving…')).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Low' })).toBeDisabled();
    await act(async () =>
      completeWrite({ ...configuration, thinking_level: 'high', thinking_level_source: 'user' }),
    );
    await waitFor(() =>
      expect(
        queryClient.isFetching({ queryKey: queryKeys.providerCatalog('http://127.0.0.1:8787') }),
      ).toBe(1),
    );
    await waitFor(() => expect(screen.queryByText('Saving…')).not.toBeInTheDocument());
    expect(screen.getByRole('radio', { name: 'High' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Low' })).toBeEnabled();
    await act(async () => completeCatalog(codexCatalog()));
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

  it('shows no response settings at all for a model that accepts none (Codex)', async () => {
    repository.providerCatalog.mockResolvedValue(
      catalog(catalogEntry('codex', [{ model_id: 'gpt-5.6-luna', accepted_parameters: [] }])),
    );
    renderModels();

    expect(await screen.findByRole('button', { name: 'Change' })).toBeVisible();
    await waitFor(() => expect(repository.providerCatalog).toHaveBeenCalled());
    expect(screen.queryByText('Response settings')).toBeNull();
    expect(document.querySelector('[data-slot="response-settings"]')).toBeNull();
  });

  it('shows a few accepted settings inline, blank meaning the provider default', async () => {
    repository.languageModelConfiguration.mockResolvedValue({ ...configuration, temperature: 0 });
    repository.providerCatalog.mockResolvedValue(
      catalog(
        catalogEntry('codex', [
          {
            model_id: 'gpt-5.6-luna',
            accepted_parameters: [
              acceptedParameter('temperature'),
              acceptedParameter('max_tokens'),
            ],
          },
        ]),
      ),
    );
    renderModels();

    const section = await screen.findByRole('region', { name: 'Response settings' });
    // Inline: no disclosure to open.
    expect(screen.queryByRole('button', { name: /Response settings/u })).toBeNull();
    const temperature = within(section).getByRole('textbox', { name: 'Temperature' });
    expect(temperature).toHaveValue('');
    expect(temperature).toHaveAttribute('placeholder', 'Default');
    expect(within(section).getByText('Provider default')).toBeVisible();
    expect(within(section).getByRole('slider', { name: 'Temperature' })).toBeVisible();
    expect(within(section).getByRole('textbox', { name: 'Longest reply' })).toBeVisible();
    // Only what the model accepts: nothing else, and no connection fields.
    expect(within(section).queryByRole('textbox', { name: 'Top K' })).toBeNull();
    expect(screen.queryByLabelText('Server address')).toBeNull();
  });

  it('shows the recommended default a model states as the resting value', async () => {
    repository.providerCatalog.mockResolvedValue(
      catalog(
        catalogEntry('codex', [
          {
            model_id: 'gpt-5.6-luna',
            accepted_parameters: [acceptedParameter('temperature', 0.6)],
          },
        ]),
      ),
    );
    renderModels();

    expect(await screen.findByText('Default 0.6')).toBeVisible();
    expect(screen.getByRole('slider', { name: 'Temperature' })).toHaveAttribute(
      'aria-valuenow',
      '0.6',
    );
  });

  it("puts a local server's long list behind one disclosure grouped Sampling / Length / Advanced", async () => {
    repository.providerCatalog.mockResolvedValue(
      catalog(
        catalogEntry('codex', [
          {
            model_id: 'gpt-5.6-luna',
            accepted_parameters: [
              acceptedParameter('temperature'),
              acceptedParameter('top_p'),
              acceptedParameter('top_k'),
              acceptedParameter('min_p'),
              acceptedParameter('repetition_penalty'),
              acceptedParameter('max_tokens'),
              acceptedParameter('context_length'),
              acceptedParameter('seed'),
            ],
          },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderModels();

    const disclosure = await screen.findByRole('button', { name: /Response settings/u });
    expect(disclosure).toHaveTextContent('8');
    expect(screen.queryByRole('textbox', { name: 'Top K' })).toBeNull();
    await user.click(disclosure);

    for (const group of ['Sampling', 'Length', 'Advanced']) {
      expect(screen.getByRole('region', { name: group })).toBeVisible();
    }
    const length = screen.getByRole('region', { name: 'Length' });
    expect(within(length).getByRole('textbox', { name: 'Context size' })).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'Advanced' })).getByRole('textbox', {
        name: 'Seed',
      }),
    ).toBeVisible();
  });

  it('keeps a saved value the model does not use, says so, and writes the whole set back', async () => {
    repository.languageModelConfiguration.mockResolvedValue({ ...configuration, top_k: 20 });
    repository.updateLanguageModelConfiguration.mockResolvedValueOnce(configuration);
    repository.providerCatalog.mockResolvedValue(
      catalog(
        catalogEntry('codex', [
          { model_id: 'gpt-5.6-luna', accepted_parameters: [acceptedParameter('temperature')] },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderModels();

    const note = await screen.findByText(/Saved but not used by this model/u);
    expect(note).toHaveTextContent('Top K 20');
    await user.type(await screen.findByRole('textbox', { name: 'Temperature' }), '0.4');
    await user.tab();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(repository.updateLanguageModelConfiguration).toHaveBeenCalled());
    const payload = repository.updateLanguageModelConfiguration.mock.calls[0]?.[0];
    // The service replaces the whole set, so the unused value rides along
    // (it is never sent to this model); the level is written only when changed.
    expect(payload).toMatchObject({ temperature: 0.4, top_k: 20 });
    expect(payload).not.toHaveProperty('thinking_level');
  });

  it('a provider that needs setup reads so on the card, and Change is where it is fixed', async () => {
    repository.providerCatalog.mockResolvedValue({
      authoritative: 'live_handshake',
      providers: [],
    });
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
      catalog(catalogEntry('codex', [{ model_id: 'gpt-5.6-luna' }, { model_id: 'gpt-5.6-sol' }])),
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
