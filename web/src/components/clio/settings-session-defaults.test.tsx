import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { providerComponentsSchema, type SessionDefaults } from '@clio/core/v3';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { setWideViewport } from '@/test-fixtures/model-picker/provider-actions';
import { afterEach, describe, expect, it, vi } from 'vitest';

const initialDefaults = {
  provider_id: '',
  model_id: '',
  effort: 'medium' as const,
  mode: 'edit' as const,
  edit_mode: 'diff' as const,
  routing_mode: 'auto' as const,
  approval_mode: 'ask' as const,
  blueprint_id: '',
};

const repository = vi.hoisted(() => ({
  sessionDefaults: vi.fn(),
  updateSessionDefaults: vi.fn(),
  languageModelConfiguration: vi.fn(),
  agentBlueprints: vi.fn(),
  providerModels: vi.fn(),
  providerCatalog: vi.fn(),
  updateLanguageModelConfiguration: vi.fn(),
  spotterAvailability: vi.fn(),
  providerHandshake: vi.fn(),
  providerAuthStatus: vi.fn(),
  providerComponents: vi.fn(),
}));

/** The live catalog: the service-default model reports Codex's real efforts. */
const catalog = {
  authoritative: 'live_handshake',
  providers: [
    {
      id: 'codex',
      name: 'OpenAI Codex',
      kind: 'codex',
      health: 'ready',
      freshness: { source: 'live', generated_at: '2026-10-06T12:00:00Z' },
      models: [
        {
          model_id: 'gpt-5.6-luna',
          availability: 'available',
          modalities: ['text'],
          reasoning: {
            supported: true,
            parameter: '',
            levels: ['minimal', 'low', 'medium', 'high', 'xhigh'],
            default: 'medium',
          },
        },
      ],
    },
  ],
};

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: 'http://127.0.0.1:8787', label: 'Research agent' },
  }),
}));

import { SessionDefaultsSettings } from './settings-session-defaults';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function renderSettings(
  providerCatalog: unknown = catalog,
  defaults: SessionDefaults = initialDefaults,
) {
  repository.sessionDefaults.mockResolvedValue(defaults);
  repository.updateSessionDefaults.mockImplementation(async (value) => value);
  repository.languageModelConfiguration.mockResolvedValue({
    configured: true,
    provider_id: 'codex',
    provider: 'codex',
    api_base: '',
    model: 'gpt-5.6-luna',
    presets: [
      {
        id: 'codex',
        label: 'OpenAI Codex',
        provider: 'codex',
        suggested_model: 'gpt-5.6-luna',
        is_authenticated: true,
        requires_api_key: false,
        auth_method: 'subscription',
      },
    ],
  });
  repository.agentBlueprints.mockResolvedValue([]);
  repository.providerCatalog.mockResolvedValue(providerCatalog);
  repository.spotterAvailability.mockResolvedValue({ available: true });
  repository.providerComponents.mockResolvedValue(
    providerComponentsSchema.parse({
      provider_id: 'codex',
      provider_kind: 'codex',
      installed: true,
      update_available: false,
    }),
  );
  repository.providerModels.mockResolvedValue({
    provider_id: 'codex',
    source: 'codex_direct_model_list',
    models: [{ id: 'gpt-5.6-luna', name: 'GPT-5.6-Luna' }],
  });
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <SessionDefaultsSettings />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('new session defaults settings', () => {
  it('edits service-owned defaults with product language', async () => {
    const user = userEvent.setup();
    renderSettings();

    expect(await screen.findByRole('heading', { name: 'New session defaults' })).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Change default model' })).toHaveTextContent(
      'OpenAI Codex / Luna',
    );
    expect(screen.queryByText('Models default')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Use model from Models settings' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Default confirmation policy')).not.toBeInTheDocument();
    expect(screen.queryByText('Agent and work mode')).not.toBeInTheDocument();
    expect(screen.queryByText('Model and reasoning')).not.toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: 'Reasoning effort' })).toHaveTextContent(
      'Medium',
    );
    expect(screen.queryByRole('radio', { name: 'Medium' })).not.toBeInTheDocument();
    expect(screen.queryByText('sidecar')).not.toBeInTheDocument();
    expect(screen.getByText('Saved to Research agent.')).toBeVisible();
    expect(screen.queryByText(/127\.0\.0\.1/)).not.toBeInTheDocument();

    expect(screen.queryByRole('combobox', { name: 'Change style' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'How work is routed' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Work mode' }));
    await user.click(screen.getByRole('option', { name: /Deep research/u }));
    await user.click(screen.getByRole('combobox', { name: 'Confirmations' }));
    await user.click(screen.getByRole('option', { name: 'SPOTTER review' }));
    await user.click(screen.getByRole('button', { name: 'Save defaults' }));

    await waitFor(() =>
      expect(repository.updateSessionDefaults).toHaveBeenCalledWith({
        ...initialDefaults,
        mode: 'architect',
        routing_mode: 'experts',
        approval_mode: 'spotter-ai',
      }),
    );
  });

  it('uses the shared searchable model picker and stages a specific model without rebinding Models', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole('button', { name: 'Change default model' }));
    const picker = await screen.findByRole('dialog', { name: 'Choose a model for new sessions' });
    expect(within(picker).getByRole('button', { name: 'Hidden (0)' })).toBeVisible();
    await user.type(within(picker).getByPlaceholderText('Search providers and models'), 'luna');
    await user.click(within(picker).getByText('gpt-5.6-luna', { exact: true }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Use model from Models settings' })).toBeVisible();
    expect(repository.updateSessionDefaults).not.toHaveBeenCalled();
    expect(repository.updateLanguageModelConfiguration).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save defaults' }));
    await waitFor(() =>
      expect(repository.updateSessionDefaults).toHaveBeenCalledWith({
        ...initialDefaults,
        provider_id: 'codex',
        model_id: 'gpt-5.6-luna',
      }),
    );
    expect(screen.queryByText(/codex_direct_model_list/u)).not.toBeInTheDocument();
  });

  it('honors the shared hidden-provider preference and exposes its existing manage action', async () => {
    setWideViewport(true);
    window.localStorage.setItem('clio.hidden-providers.v1', JSON.stringify(['codex']));
    const user = userEvent.setup();
    renderSettings();
    await user.click(await screen.findByRole('button', { name: 'Change default model' }));
    const picker = await screen.findByRole('dialog', { name: 'Choose a model for new sessions' });
    expect(within(picker).queryByText('OpenAI Codex')).not.toBeInTheDocument();
    await user.click(within(picker).getByRole('button', { name: 'Hidden (1)' }));
    expect(await within(picker).findByText('OpenAI Codex')).toBeVisible();
  });

  it('can return a pinned model to the inherited Models default', async () => {
    const user = userEvent.setup();
    renderSettings(catalog, { ...initialDefaults, provider_id: 'codex', model_id: 'gpt-5.6-luna' });
    await user.click(await screen.findByRole('button', { name: 'Use model from Models settings' }));
    expect(
      screen.queryByRole('button', { name: 'Use model from Models settings' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Models default')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save defaults' }));
    await waitFor(() =>
      expect(repository.updateSessionDefaults).toHaveBeenCalledWith(initialDefaults),
    );
    expect(repository.updateLanguageModelConfiguration).not.toHaveBeenCalled();
  });

  it('resets an incompatible effort when choosing another model', async () => {
    const user = userEvent.setup();
    renderSettings({
      ...catalog,
      providers: [
        {
          ...catalog.providers[0],
          models: [
            ...catalog.providers[0]!.models,
            {
              model_id: 'gpt-5.6-sol',
              availability: 'available',
              modalities: ['text'],
              reasoning: { supported: true, parameter: '', levels: ['low'], default: 'low' },
            },
          ],
        },
      ],
    });
    await user.click(await screen.findByRole('button', { name: 'Change default model' }));
    await user.type(screen.getByPlaceholderText('Search providers and models'), 'gpt-5.6-sol');
    await user.click(await screen.findByText('gpt-5.6-sol', { exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: 'Reasoning effort' })).toHaveTextContent('Low');
    await user.click(screen.getByRole('button', { name: 'Save defaults' }));
    await waitFor(() =>
      expect(repository.updateSessionDefaults).toHaveBeenCalledWith(
        expect.objectContaining({ provider_id: 'codex', model_id: 'gpt-5.6-sol', effort: null }),
      ),
    );
  });

  it('resets an unknown effort when pinning a model', async () => {
    const user = userEvent.setup();
    renderSettings(catalog, { ...initialDefaults, effort: 'unknown' });
    await user.click(await screen.findByRole('button', { name: 'Change default model' }));
    await user.type(screen.getByPlaceholderText('Search providers and models'), 'luna');
    await user.click(await screen.findByText('gpt-5.6-luna', { exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: 'Reasoning effort' })).toHaveTextContent('Default');
    await user.click(screen.getByRole('button', { name: 'Save defaults' }));
    await waitFor(() =>
      expect(repository.updateSessionDefaults).toHaveBeenCalledWith(
        expect.objectContaining({ provider_id: 'codex', model_id: 'gpt-5.6-luna', effort: null }),
      ),
    );
  });

  it('reports a defaults read failure instead of leaving the page loading', async () => {
    repository.sessionDefaults.mockRejectedValueOnce(new Error('Defaults unavailable'));
    renderSettings();
    expect(await screen.findByRole('alert')).toHaveTextContent('Defaults unavailable');
    expect(
      screen.queryByText('Loading defaults from the connected service…'),
    ).not.toBeInTheDocument();
  });
});

describe('new session default reasoning comes from the model', () => {
  it('lists exactly the levels the model new sessions start on reports', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole('combobox', { name: 'Reasoning effort' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Default (Medium)',
      'Minimal',
      'Low',
      'Medium',
      'High',
      'Extra high',
    ]);
  });

  it('saves "Model default" as a reset, not a fixed level', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole('combobox', { name: 'Reasoning effort' }));
    await user.click(screen.getByRole('option', { name: 'Default (Medium)' }));
    await user.click(screen.getByRole('button', { name: 'Save defaults' }));

    await waitFor(() =>
      expect(repository.updateSessionDefaults).toHaveBeenCalledWith(
        expect.objectContaining({ effort: null }),
      ),
    );
  });

  it('shows no reasoning field for a model that reports no levels', async () => {
    renderSettings({
      authoritative: 'live_handshake',
      providers: [
        {
          id: 'codex',
          name: 'OpenAI Codex',
          kind: 'codex',
          health: 'ready',
          freshness: { source: 'live', generated_at: '2026-10-06T12:00:00Z' },
          models: [
            {
              model_id: 'gpt-5.6-luna',
              availability: 'available',
              modalities: ['text'],
              reasoning: { supported: false, parameter: '', levels: [] },
            },
          ],
        },
      ],
    });
    expect(await screen.findByRole('button', { name: 'Change default model' })).toBeVisible();
    await waitFor(() => expect(repository.providerCatalog).toHaveBeenCalled());
    expect(screen.queryByRole('combobox', { name: 'Reasoning effort' })).not.toBeInTheDocument();
  });
});
