import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalog, catalogEntry } from '@/test-fixtures/provider-catalog';
import { setWideViewport } from '@/test-fixtures/model-picker/provider-actions';
import { ProvidersSettings } from './settings-providers';

const { repository } = vi.hoisted(() => ({
  repository: {
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
  },
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));
vi.mock('@/tauri/secure-credentials', () => ({
  storeProviderCredential: vi.fn().mockResolvedValue(undefined),
  readProviderCredential: vi.fn().mockResolvedValue(undefined),
}));

const local = (id: string, label: string, port: number) => ({
  id,
  label,
  provider: 'openai',
  provider_id: id,
  api_base: `http://127.0.0.1:${port}/v1`,
  suggested_model: '',
  requires_api_key: false,
  auth_method: 'none',
  is_authenticated: true,
  supports_live_catalog: true,
  supports_vision: false,
});

const presets = [
  {
    id: 'codex',
    label: 'Codex',
    provider: 'codex',
    suggested_model: 'gpt-5.5',
    requires_api_key: false,
    auth_method: 'subscription',
    is_authenticated: true,
    supports_live_catalog: true,
    supports_vision: true,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    provider: 'openrouter',
    api_base: 'https://openrouter.ai/api/v1',
    suggested_model: '',
    requires_api_key: true,
    auth_method: 'api_key',
    is_authenticated: false,
    status: 'missing_key',
    supports_live_catalog: true,
    supports_vision: false,
  },
  local('lm_studio', 'LM Studio', 1234),
  local('vllm', 'vLLM', 8000),
];

const configuration = {
  configured: true,
  provider_id: 'codex',
  provider: 'codex',
  api_base: '',
  model: 'gpt-5.5',
  presets,
};

beforeEach(() => {
  setWideViewport(true);
  repository.languageModelConfiguration.mockResolvedValue(configuration);
  repository.providerCatalog.mockResolvedValue(
    catalog(
      catalogEntry('codex', [{ model_id: 'gpt-5.5' }], { name: 'Codex' }),
      catalogEntry('openrouter', [], {
        name: 'OpenRouter',
        health: 'unavailable',
        auth: 'missing',
        failure: 'no API key provided',
      }),
      catalogEntry('lm_studio', [{ model_id: 'qwen3-8b' }, { model_id: 'gemma-3' }], {
        name: 'LM Studio',
        endpoint: 'http://127.0.0.1:1234/v1',
      }),
      catalogEntry('vllm', [], {
        name: 'vLLM',
        health: 'unavailable',
        connectivity: 'unreachable',
        failure: 'connection refused',
      }),
    ),
  );
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
  for (const mock of Object.values(repository)) mock.mockReset();
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={['/settings/providers']}>
      <QueryClientProvider client={queryClient}>
        <ProvidersSettings />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function card(id: string): Promise<HTMLElement> {
  await waitFor(() =>
    expect(document.querySelector(`[data-slot="local-server-card"][data-provider-id="${id}"]`)).not.toBeNull(),
  );
  return document.querySelector(`[data-slot="local-server-card"][data-provider-id="${id}"]`) as HTMLElement;
}

/** Words that belong only in the Technical details sheet. */
const TECHNICAL = /endpoint|configuration|credential|catalog|handshake|probe/iu;

describe('ProvidersSettings', () => {
  it('lists only the servers on this computer as cards; a stopped one is grey, never red', async () => {
    renderPage();

    const lmStudio = await card('lm_studio');
    expect(within(lmStudio).getByText('Running, 2 models')).toBeVisible();
    expect(within(lmStudio).getByText('http://127.0.0.1:1234/v1')).toBeVisible();
    const vllm = await card('vllm');
    const stopped = within(vllm).getByText('Not running');
    expect(stopped).toBeVisible();
    expect(stopped.className).not.toMatch(/destructive/u);
    // Cloud and subscription providers are never server cards.
    expect(document.querySelector('[data-provider-id="codex"]')).toBeNull();
    expect(document.querySelector('[data-provider-id="openrouter"]')).toBeNull();
  });

  it('has no sign-in, key or connect flow, and no technical words outside the details sheet', async () => {
    renderPage();
    await card('lm_studio');

    expect(screen.queryByRole('button', { name: /Sign in|Log in|Connect|Install/u })).toBeNull();
    expect(screen.queryByLabelText(/key/iu)).toBeNull();
    const page = document.body.textContent ?? '';
    expect(page).not.toMatch(TECHNICAL);
  });

  it('opens a cloud provider in the model picker instead of setting it up here', async () => {
    const user = userEvent.setup();
    renderPage();
    const cloud = await screen.findByRole('region', { name: 'Cloud and subscription providers' });

    await user.click(within(cloud).getByRole('button', { name: /OpenRouter/u }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByPlaceholderText('Search providers and models')).toBeVisible();
    expect(await within(dialog).findByLabelText('OpenRouter key')).toBeVisible();
  });

  it('checks an edited address live and keeps it by making the server the default', async () => {
    repository.providerHandshake.mockResolvedValueOnce({
      connectivity: 'ok',
      auth: 'not_required',
      models: [{ id: 'qwen3-8b' }, { id: 'gemma-3' }, { id: 'phi-4' }],
      source: 'live',
      generated_at: '',
    });
    repository.updateLanguageModelConfiguration.mockResolvedValueOnce(configuration);
    const user = userEvent.setup();
    renderPage();
    const lmStudio = await card('lm_studio');

    await user.click(within(lmStudio).getByRole('button', { name: 'Change the LM Studio address' }));
    const field = within(lmStudio).getByLabelText('LM Studio address');
    await user.clear(field);
    await user.type(field, '127.0.0.1:1235');
    await user.click(within(lmStudio).getByRole('button', { name: 'Check' }));

    await waitFor(() =>
      expect(repository.providerHandshake).toHaveBeenCalledWith('lm_studio', {
        apiBase: 'http://127.0.0.1:1235/v1',
        refresh: true,
      }),
    );
    expect(await within(lmStudio).findByText('Running, with 3 models.')).toBeVisible();
    await user.click(within(lmStudio).getByRole('button', { name: 'Use this server' }));

    await waitFor(() =>
      expect(repository.updateLanguageModelConfiguration).toHaveBeenCalledWith({
        provider_id: 'lm_studio',
        provider: 'openai',
        api_base: 'http://127.0.0.1:1235/v1',
        model: 'qwen3-8b',
        provider_options: {},
      }),
    );
  });

  it('a check that finds nothing says so in one sentence and offers nothing to save', async () => {
    repository.providerHandshake.mockResolvedValueOnce({
      connectivity: 'unreachable',
      auth: 'not_required',
      models: [],
      source: 'unavailable',
      generated_at: '',
    });
    const user = userEvent.setup();
    renderPage();
    const vllm = await card('vllm');

    await user.click(within(vllm).getByRole('button', { name: 'Check' }));

    expect(await within(vllm).findByText('Nothing is running at this address.')).toBeVisible();
    expect(within(vllm).queryByRole('button', { name: /Use this server|Save address/u })).toBeNull();
  });

  it('adds a self-hosted server from a short dialog: address, Check, Use', async () => {
    repository.providerHandshake.mockResolvedValueOnce({
      connectivity: 'ok',
      auth: 'not_required',
      models: [{ id: 'meta-llama/Llama-3.3-70B' }],
      source: 'live',
      generated_at: '',
    });
    repository.updateLanguageModelConfiguration.mockResolvedValueOnce(configuration);
    const user = userEvent.setup();
    renderPage();
    await card('vllm');

    await user.click(screen.getByRole('button', { name: 'Add a server' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Server address'), 'gpu-node-7:8000');
    await user.click(within(dialog).getByRole('button', { name: 'Check' }));
    expect(await within(dialog).findByText('Running, with 1 model.')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Use this server' }));

    await waitFor(() =>
      expect(repository.updateLanguageModelConfiguration).toHaveBeenCalledWith({
        provider_id: 'vllm',
        provider: 'openai',
        api_base: 'http://gpu-node-7:8000/v1',
        model: 'meta-llama/Llama-3.3-70B',
        provider_options: {},
      }),
    );
  });

  it('keeps the technical facts in one sheet opened from a quiet link', async () => {
    const user = userEvent.setup();
    renderPage();
    const vllm = await card('vllm');

    await user.click(within(vllm).getByRole('button', { name: 'Technical details' }));

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Endpoint')).toBeVisible();
    expect(within(sheet).getByText('connection refused')).toBeVisible();
    expect(within(sheet).getByText('Unreachable')).toBeVisible();
  });
});
