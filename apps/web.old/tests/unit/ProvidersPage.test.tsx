import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@clio/core';
import { ProvidersPage } from '../../src/routes/discovery/ProvidersPage.js';

afterEach(cleanup);

function makeClient(overrides: Partial<Record<keyof Client, unknown>> = {}) {
  const providers = vi.fn().mockResolvedValue({
    providers: [
      {
        id: 'argonne',
        name: 'Argonne Sophia',
        description: 'ALCF-hosted OpenAI-compatible endpoint',
        default_model: 'openai/gpt-oss-120b',
        api_base: 'https://sophia/v1',
        auth_methods: ['oauth'],
        is_authenticated: true,
      },
      {
        id: 'ollama',
        name: 'Ollama',
        default_model: 'granite3.1-dense:8b',
        api_base: 'http://127.0.0.1:11434/v1',
        auth_methods: [],
        is_authenticated: true,
      },
    ],
  });
  const lmConfig = vi.fn().mockResolvedValue({
    configured: true,
    provider: 'argonne',
    api_base: 'https://sophia/v1',
    model: 'openai/gpt-oss-120b',
  });
  const setLm = vi.fn().mockResolvedValue({
    configured: true,
    provider: 'ollama',
    api_base: 'http://127.0.0.1:11434/v1',
    model: 'granite3.1-dense:8b',
  });
  const providerModels = vi.fn().mockResolvedValue({
    models: [
      {
        id: 'openai/gpt-oss-120b',
        label: 'GPT OSS 120B',
        source: 'discovered',
        context_length: 131_000,
      },
    ],
  });
  const getProvider = vi.fn().mockResolvedValue({
    id: 'argonne',
    vendor: 'ALCF',
    status: 'ready',
    auth: { kind: 'oauth', required: true },
  });
  const authProvider = vi.fn().mockResolvedValue({
    is_authenticated: false,
    provider_id: 'argonne',
    instructions: 'Run globus login',
  });
  const client = {
    providers,
    lmConfig,
    setLm,
    providerModels,
    getProvider,
    authProvider,
    ...overrides,
  } as unknown as Client;
  return { client, providers, lmConfig, setLm, providerModels, getProvider, authProvider };
}

async function waitForProviders() {
  await waitFor(() => expect(screen.getByTestId('provider-card-argonne')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('providers-active')).toBeTruthy());
}

describe('ProvidersPage', () => {
  it('renders active provider state and switches LM from a provider card', async () => {
    const { client, setLm } = makeClient();
    render(() => <ProvidersPage client={client} />);
    await waitForProviders();

    expect(screen.getByTestId('provider-card-argonne').textContent).toContain('active');
    fireEvent.click(screen.getByTestId('provider-use-ollama'));

    await waitFor(() =>
      expect(setLm).toHaveBeenCalledWith({
        provider: 'ollama',
        api_base: 'http://127.0.0.1:11434/v1',
        model: 'granite3.1-dense:8b',
      }),
    );
  });

  it('lazy-loads provider models and detail when a card expands', async () => {
    const { client, providerModels, getProvider } = makeClient();
    render(() => <ProvidersPage client={client} />);
    await waitForProviders();

    expect(providerModels).not.toHaveBeenCalled();
    expect(getProvider).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('provider-models-toggle-argonne'));

    await waitFor(() => expect(providerModels).toHaveBeenCalledWith('argonne'));
    await waitFor(() => expect(getProvider).toHaveBeenCalledWith('argonne'));
    await waitFor(() =>
      expect(screen.getByTestId('provider-model-openai/gpt-oss-120b').textContent).toContain(
        'GPT OSS 120B',
      ),
    );
    expect(screen.getByTestId('provider-detail-argonne').textContent).toContain('ALCF');
  });
});
