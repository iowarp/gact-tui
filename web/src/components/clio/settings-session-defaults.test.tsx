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
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

import { SessionDefaultsSettings } from './settings-session-defaults';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderSettings() {
  repository.sessionDefaults.mockResolvedValue(initialDefaults);
  repository.updateSessionDefaults.mockImplementation(async (value) => value);
  repository.languageModelConfiguration.mockResolvedValue({
    configured: true,
    provider: 'codex',
    api_base: '',
    model: 'gpt-5.6-luna',
    presets: [
      {
        id: 'codex',
        label: 'Codex',
        provider: 'codex',
        suggested_model: 'gpt-5.6-luna',
        is_authenticated: true,
      },
    ],
  });
  repository.agentBlueprints.mockResolvedValue([]);
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
    expect(screen.getByRole('combobox', { name: 'Reasoning effort' })).toHaveTextContent('Medium');
    expect(screen.queryByRole('radio', { name: 'Medium' })).not.toBeInTheDocument();
    expect(screen.queryByText('sidecar')).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Default review' }));
    await user.click(screen.getByRole('option', { name: 'SPOTTER review' }));
    await user.click(screen.getByRole('button', { name: 'Save new session defaults' }));

    await waitFor(() =>
      expect(repository.updateSessionDefaults).toHaveBeenCalledWith({
        ...initialDefaults,
        approval_mode: 'spotter-ai',
      }),
    );
  });
});
