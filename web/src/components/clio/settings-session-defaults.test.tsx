import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
}));

/** The live catalog: the service-default model reports Codex's real efforts. */
const catalog = {
  authoritative: 'live_handshake',
  providers: [
    {
      id: 'codex',
      name: 'OpenAI Codex',
      models: [
        {
          model_id: 'gpt-5.6-luna',
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
  vi.clearAllMocks();
});

function renderSettings(providerCatalog: unknown = catalog) {
  repository.sessionDefaults.mockResolvedValue(initialDefaults);
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
      },
    ],
  });
  repository.agentBlueprints.mockResolvedValue([]);
  repository.providerCatalog.mockResolvedValue(providerCatalog);
  repository.providerModels.mockResolvedValue({
    provider_id: 'codex',
    source: 'codex_app_server',
    models: [{ id: 'gpt-5.6-luna', name: 'GPT-5.6-Luna' }],
  });
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SessionDefaultsSettings />
    </QueryClientProvider>,
  );
}

describe('new session defaults settings', () => {
  it('edits service-owned defaults with product language', async () => {
    const user = userEvent.setup();
    renderSettings();

    expect(await screen.findByRole('heading', { name: 'New session defaults' })).toBeVisible();
    expect(await screen.findByRole('combobox', { name: 'Model source' })).toHaveTextContent(
      'Use Models default',
    );
    expect(await screen.findByRole('combobox', { name: 'Reasoning effort' })).toHaveTextContent(
      'Medium',
    );
    expect(screen.queryByRole('radio', { name: 'Medium' })).not.toBeInTheDocument();
    expect(screen.queryByText('sidecar')).not.toBeInTheDocument();
    expect(screen.getByText('Saved to Research agent.')).toBeVisible();
    expect(screen.queryByText(/127\.0\.0\.1/)).not.toBeInTheDocument();

    expect(screen.queryByRole('combobox', { name: 'Change style' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'How work is routed' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Default work mode' }));
    await user.click(screen.getByRole('option', { name: /Deep research/u }));
    await user.click(screen.getByRole('combobox', { name: 'Default confirmation policy' }));
    await user.click(screen.getByRole('option', { name: 'SPOTTER review' }));
    await user.click(screen.getByRole('button', { name: 'Save new session defaults' }));

    await waitFor(() =>
      expect(repository.updateSessionDefaults).toHaveBeenCalledWith({
        ...initialDefaults,
        mode: 'architect',
        routing_mode: 'experts',
        approval_mode: 'spotter-ai',
      }),
    );
  });

  it('offers live provider models without exposing the catalog implementation', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole('combobox', { name: 'Model source' }));
    await user.click(screen.getByRole('option', { name: 'OpenAI Codex' }));

    expect(await screen.findByRole('combobox', { name: 'Model' })).toHaveTextContent(
      'GPT-5.6-Luna',
    );
    expect(screen.getByText('Available models were checked by the connected agent.')).toBeVisible();
    expect(screen.queryByText(/codex_app_server/u)).not.toBeInTheDocument();
  });
});

describe('new session default reasoning comes from the model', () => {
  it('lists exactly the levels the model new sessions start on reports', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole('combobox', { name: 'Reasoning effort' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Model default (Medium)',
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
    await user.click(screen.getByRole('option', { name: 'Model default (Medium)' }));
    await user.click(screen.getByRole('button', { name: 'Save new session defaults' }));

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
          models: [
            {
              model_id: 'gpt-5.6-luna',
              reasoning: { supported: false, parameter: '', levels: [] },
            },
          ],
        },
      ],
    });
    expect(await screen.findByRole('combobox', { name: 'Model source' })).toBeVisible();
    await waitFor(() => expect(repository.providerCatalog).toHaveBeenCalled());
    expect(screen.queryByRole('combobox', { name: 'Reasoning effort' })).not.toBeInTheDocument();
  });
});
