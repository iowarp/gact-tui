import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalog, catalogEntry } from '@/test-fixtures/provider-catalog';
import { setWideViewport } from '@/test-fixtures/model-picker/provider-actions';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ProvidersSettings } from './settings-providers';
import { modelPickerCatalog } from './model-picker-catalog-loader';

const { repository } = vi.hoisted(() => ({
  repository: {
    languageModelConfiguration: vi.fn(),
    providerModels: vi.fn(),
    refreshProviderModels: vi.fn(),
    providerHandshake: vi.fn(),
    installProviderSupport: vi.fn(),
    startProviderInstall: vi.fn(),
    providerInstallJobs: vi.fn().mockResolvedValue([]),
    authenticateProvider: vi.fn(),
    completeProviderAuthentication: vi.fn(),
    providerAuthStatus: vi.fn(),
    logoutProvider: vi.fn(),
    updateLanguageModelConfiguration: vi.fn(),
    saveProviderApiKey: vi.fn(),
    clearProviderApiKey: vi.fn(),
    providerCatalog: vi.fn(),
    providerComponents: vi.fn(),
    savedServers: vi.fn(),
    addSavedServer: vi.fn(),
    updateSavedServer: vi.fn(),
    removeSavedServer: vi.fn(),
    checkSavedServer: vi.fn(),
  },
}));

const upCheck = (models: string[]) => ({
  reachable: true,
  connectivity: 'ok',
  models,
  error: '',
  checked_at: '2026-09-26T00:00:00Z',
});
const downCheck = {
  reachable: false,
  connectivity: 'unreachable',
  models: [],
  error: 'connection refused',
  checked_at: '2026-09-26T00:00:00Z',
};

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));
vi.mock('@/tauri/secure-credentials', () => ({
  storeProviderCredential: vi.fn().mockResolvedValue(undefined),
  deleteProviderCredential: vi.fn().mockResolvedValue(undefined),
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
  repository.savedServers.mockResolvedValue([]);
  repository.providerComponents.mockResolvedValue({
    installed: true,
    update_available: false,
    components: [],
  });
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

function renderPage(url = '/settings/providers') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ProvidersSettings />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function row(id: string): Promise<HTMLElement> {
  const selector = `[data-slot="model-server-row"][data-provider-id="${id}"]`;
  await waitFor(() => expect(document.querySelector(selector)).not.toBeNull());
  return document.querySelector(selector) as HTMLElement;
}

function tone(target: HTMLElement): string | null {
  return target.querySelector('[data-slot="status-indicator"]')?.getAttribute('data-tone') ?? null;
}

/** Words that belong only in a server's details. */
const TECHNICAL = /endpoint|configuration|credential|catalog|handshake|probe/iu;

// The picker's catalog loads on first open; warm it once so each open renders it at once.
beforeAll(() => modelPickerCatalog.load());

describe('ProvidersSettings', () => {
  it('adds a known runtime by kind and saves an Ollama root without the OpenAI API prefix', async () => {
    repository.languageModelConfiguration.mockResolvedValue({
      ...configuration,
      presets: [
        ...presets,
        {
          ...local('ollama', 'Ollama', 11434),
          provider: 'ollama',
          api_base: 'http://127.0.0.1:11434',
        },
      ],
    });
    repository.addSavedServer.mockResolvedValue({
      id: 'ollama',
      preset_id: 'ollama',
      label: 'Ollama',
      address: 'http://gpu-7:11434',
      custom: false,
    });
    const user = userEvent.setup();
    renderPage();
    await row('lm_studio');

    await user.click(screen.getByRole('button', { name: 'Add server' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: 'Server kind' }));
    await user.click(await screen.findByRole('option', { name: 'Ollama' }));
    expect(within(dialog).queryByLabelText('Name')).toBeNull();
    await user.type(within(dialog).getByLabelText('Server address'), 'gpu-7:11434');
    await user.click(within(dialog).getByRole('button', { name: /^Add/u }));

    await waitFor(() =>
      expect(repository.addSavedServer).toHaveBeenCalledWith({
        address: 'http://gpu-7:11434',
        preset_id: 'ollama',
        label: undefined,
      }),
    );
    expect(repository.updateLanguageModelConfiguration).not.toHaveBeenCalled();
  });

  it('focuses the requested server row without changing the model', async () => {
    const scroll = vi.fn();
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(scroll);
    try {
      renderPage('/settings/providers?provider=vllm');
      const target = await row('vllm');
      await waitFor(() => expect(target).toHaveFocus());
      expect(scroll).toHaveBeenCalledWith({ block: 'center' });
      expect(repository.updateLanguageModelConfiguration).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('lists servers in use, saved or running as rows; a stopped one here is grey, one elsewhere red', async () => {
    repository.savedServers.mockResolvedValue([
      {
        id: 'vllm',
        preset_id: 'vllm',
        label: 'vLLM',
        address: 'http://127.0.0.1:8000/v1',
        custom: false,
        check: downCheck,
      },
      {
        id: 'server-workstation',
        preset_id: 'vllm',
        label: 'Workstation',
        address: 'http://10.0.4.12:8000/v1',
        custom: true,
        check: downCheck,
      },
    ]);
    renderPage();

    const lmStudio = await row('lm_studio');
    expect(within(lmStudio).getByText('Running')).toBeVisible();
    expect(within(lmStudio).getByText('2 models')).toBeVisible();
    expect(within(lmStudio).getByText('127.0.0.1:1234')).toBeVisible();
    const vllm = await row('vllm');
    expect(within(vllm).getByText('Not running')).toBeVisible();
    expect(tone(vllm)).toBe('inactive');
    const workstation = await row('server-workstation');
    expect(within(workstation).getByText('Can’t reach')).toBeVisible();
    expect(within(workstation).getByText('No answer at this address')).toBeVisible();
    expect(tone(workstation)).toBe('error');
    expect(within(workstation).getByRole('button', { name: 'Retry Workstation' })).toBeVisible();
    // Cloud and subscription providers are never server rows.
    expect(document.querySelector('[data-provider-id="codex"]')).toBeNull();
    expect(document.querySelector('[data-provider-id="openrouter"]')).toBeNull();
    expect(screen.getByRole('group', { name: 'Model servers, 1 of 3 running' })).toBeVisible();
  });

  it('says so when there is no server yet, and offers to add one', async () => {
    repository.providerCatalog.mockResolvedValue(
      catalog(catalogEntry('codex', [{ model_id: 'gpt-5.5' }], { name: 'Codex' })),
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('No model servers yet')).toBeVisible();
    await user.click(screen.getAllByRole('button', { name: 'Add server' }).at(-1)!);
    expect(await screen.findByRole('dialog', { name: 'Add server' })).toBeVisible();
  });

  it('shows a load failure in place of the list, with Retry', async () => {
    repository.savedServers.mockRejectedValue(new Error('Request failed with 503'));
    renderPage();

    // Plain words in place; the service's own message stays in the hover title.
    const failure = await screen.findByText('The agent could not load providers.');
    expect(failure).toBeVisible();
    expect(screen.getByTitle('Request failed with 503')).toContainElement(failure);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
    expect(document.querySelector('[data-slot="model-server-row"]')).toBeNull();
  });

  it('has no sign-in, key or connect flow, and no technical words outside the details', async () => {
    renderPage();
    await row('lm_studio');

    const flows = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent ?? '')
      .filter((name) => /Sign in|Log in|Connect|Install/u.test(name));
    expect(flows).toEqual([]);
    expect(screen.queryByLabelText(/\bkey\b/iu)).toBeNull();
    const page = document.body.textContent ?? '';
    expect(page).not.toMatch(TECHNICAL);
  });

  it('opens the model picker on the provider asked for instead of setting it up here', async () => {
    const user = userEvent.setup();
    renderPage('/settings/providers?provider=openrouter');

    await user.click(await screen.findByRole('button', { name: 'Open model picker' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByPlaceholderText('Search providers and models')).toBeVisible();
    expect(await within(dialog).findByLabelText('OpenRouter key')).toBeVisible();
  });

  it("another model of the active provider keeps that provider's options", async () => {
    repository.languageModelConfiguration.mockResolvedValue({
      ...configuration,
      provider_options: { show_diffusion: 'on' },
    });
    repository.providerCatalog.mockResolvedValue(
      catalog(
        catalogEntry('codex', [{ model_id: 'gpt-5.5' }, { model_id: 'gpt-5.4' }], {
          name: 'Codex',
        }),
      ),
    );
    repository.updateLanguageModelConfiguration.mockResolvedValueOnce(configuration);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Open model picker' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('option', { name: /5\.4/u }));

    await waitFor(() =>
      expect(repository.updateLanguageModelConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({
          provider_id: 'codex',
          model: 'gpt-5.4',
          provider_options: { show_diffusion: 'on' },
        }),
      ),
    );
  });

  it('edits an address in the row; the service saves and checks it at once', async () => {
    const saved = {
      id: 'lm_studio',
      preset_id: 'lm_studio',
      label: 'LM Studio',
      address: 'http://127.0.0.1:1235/v1',
      custom: false,
      check: upCheck(['qwen3-8b', 'gemma-3', 'phi-4']),
    };
    repository.addSavedServer.mockImplementationOnce(async () => {
      repository.savedServers.mockResolvedValue([saved]);
      return saved;
    });
    const user = userEvent.setup();
    renderPage();
    const lmStudio = await row('lm_studio');

    await user.click(within(lmStudio).getByRole('button', { name: 'Edit address' }));
    const field = within(lmStudio).getByLabelText('LM Studio address');
    await user.clear(field);
    await user.type(field, '127.0.0.1:1235');
    await user.click(within(lmStudio).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(repository.addSavedServer).toHaveBeenCalledWith({
        address: 'http://127.0.0.1:1235/v1',
        label: undefined,
        preset_id: 'lm_studio',
      }),
    );
    expect(await within(lmStudio).findByText('3 models')).toBeVisible();
    expect(within(lmStudio).getByText('127.0.0.1:1235')).toBeVisible();
    // Saving never makes it the default: that is its own choice.
    expect(repository.updateLanguageModelConfiguration).not.toHaveBeenCalled();
  });

  it('Esc leaves the address as it was', async () => {
    const user = userEvent.setup();
    renderPage();
    const lmStudio = await row('lm_studio');

    await user.click(within(lmStudio).getByRole('button', { name: 'Edit address' }));
    await user.type(within(lmStudio).getByLabelText('LM Studio address'), 'x{Escape}');

    expect(within(lmStudio).queryByLabelText('LM Studio address')).toBeNull();
    expect(within(lmStudio).getByText('127.0.0.1:1234')).toBeVisible();
    expect(repository.addSavedServer).not.toHaveBeenCalled();
  });

  it('uses a running server only when asked; the one in use says so', async () => {
    repository.updateLanguageModelConfiguration.mockResolvedValueOnce(configuration);
    const user = userEvent.setup();
    renderPage();
    const lmStudio = await row('lm_studio');

    await user.click(within(lmStudio).getByRole('button', { name: 'Use LM Studio' }));

    await waitFor(() =>
      expect(repository.updateLanguageModelConfiguration).toHaveBeenCalledWith({
        provider_id: 'lm_studio',
        provider: 'openai',
        api_base: 'http://127.0.0.1:1234/v1',
        model: '',
        provider_options: {},
      }),
    );
  });

  it('marks the server in use', async () => {
    repository.languageModelConfiguration.mockResolvedValue({
      ...configuration,
      provider_id: 'lm_studio',
      provider: 'openai',
      api_base: 'http://127.0.0.1:1234/v1',
      model: 'qwen3-8b',
    });
    renderPage();
    const lmStudio = await row('lm_studio');

    expect(within(lmStudio).getByText('In use')).toBeVisible();
    expect(within(lmStudio).queryByRole('button', { name: 'Use LM Studio' })).toBeNull();
  });

  it('Use on a stopped server here checks first, and asks to start it when nothing answers', async () => {
    repository.providerHandshake.mockResolvedValueOnce({
      connectivity: 'unreachable',
      auth: 'not_required',
      models: [],
      source: 'unavailable',
      generated_at: '',
    });
    const user = userEvent.setup();
    renderPage('/settings/providers?provider=vllm');
    const vllm = await row('vllm');

    await user.click(within(vllm).getByRole('button', { name: 'Use vLLM' }));

    await waitFor(() =>
      expect(repository.providerHandshake).toHaveBeenCalledWith('vllm', {
        apiBase: 'http://127.0.0.1:8000/v1',
        refresh: true,
      }),
    );
    expect(await within(vllm).findByText('Start vLLM, then choose Use')).toBeVisible();
    expect(within(vllm).getByText('Not running')).toBeVisible();
    expect(repository.updateLanguageModelConfiguration).not.toHaveBeenCalled();
  });

  it('retries a custom server, and removes it after an inline question', async () => {
    const custom = {
      id: 'server-gpu-node',
      preset_id: 'vllm',
      label: 'GPU node',
      address: 'http://gpu-node-7:8000/v1',
      custom: true,
      check: downCheck,
    };
    repository.savedServers.mockResolvedValue([custom]);
    repository.checkSavedServer.mockImplementationOnce(async () => {
      const checked = { ...custom, check: upCheck(['llama-70b']) };
      repository.savedServers.mockResolvedValue([checked]);
      return checked;
    });
    repository.removeSavedServer.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderPage();
    const node = await row('server-gpu-node');

    expect(within(node).getByText('GPU node')).toBeVisible();
    await user.click(within(node).getByRole('button', { name: 'Retry GPU node' }));
    await waitFor(() =>
      expect(repository.checkSavedServer).toHaveBeenCalledWith('server-gpu-node'),
    );
    expect(await within(node).findByText('1 model')).toBeVisible();

    await user.click(within(node).getByRole('button', { name: 'Remove' }));
    expect(within(node).getByText('Remove GPU node?')).toBeVisible();
    expect(within(node).getByRole('button', { name: 'Keep' })).toHaveFocus();
    expect(repository.removeSavedServer).not.toHaveBeenCalled();
    await user.click(within(node).getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(repository.removeSavedServer).toHaveBeenCalledWith('server-gpu-node'),
    );
  });

  it('Delete on a row asks first; Keep leaves it', async () => {
    repository.savedServers.mockResolvedValue([
      {
        id: 'server-gpu-node',
        preset_id: 'vllm',
        label: 'GPU node',
        address: 'http://gpu-node-7:8000/v1',
        custom: true,
        check: downCheck,
      },
    ]);
    const user = userEvent.setup();
    renderPage();
    const node = await row('server-gpu-node');

    node.focus();
    await user.keyboard('{Delete}');
    expect(within(node).getByText('Remove GPU node?')).toBeVisible();
    await user.click(within(node).getByRole('button', { name: 'Keep' }));
    expect(within(node).queryByText('Remove GPU node?')).toBeNull();
    expect(repository.removeSavedServer).not.toHaveBeenCalled();
  });

  it('a runtime with a saved address can go back to its own', async () => {
    repository.savedServers.mockResolvedValue([
      {
        id: 'lm_studio',
        preset_id: 'lm_studio',
        label: 'LM Studio',
        address: 'http://127.0.0.1:1235/v1',
        custom: false,
      },
    ]);
    repository.removeSavedServer.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderPage();
    const lmStudio = await row('lm_studio');

    expect(within(lmStudio).getByText('127.0.0.1:1235')).toBeVisible();
    await user.click(within(lmStudio).getByRole('button', { name: 'Reset address' }));
    expect(within(lmStudio).getByText('Go back to 127.0.0.1:1234?')).toBeVisible();
    await user.click(within(lmStudio).getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(repository.removeSavedServer).toHaveBeenCalledWith('lm_studio'));
  });

  it('adds a self-hosted server from a short dialog and ends on what its check found', async () => {
    repository.addSavedServer.mockResolvedValueOnce({
      id: 'server-gpu-node',
      preset_id: 'vllm',
      label: 'GPU node',
      address: 'http://gpu-node-7:8000/v1',
      custom: true,
      check: upCheck(['meta-llama/Llama-3.3-70B']),
    });
    const user = userEvent.setup();
    renderPage();
    await row('lm_studio');

    await user.click(screen.getByRole('button', { name: 'Add server' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Server address')).toHaveFocus();
    await user.type(within(dialog).getByLabelText('Name'), 'GPU node');
    await user.type(within(dialog).getByLabelText('Server address'), 'gpu-node-7:8000');
    await user.click(within(dialog).getByRole('button', { name: /^Add/u }));

    await waitFor(() =>
      expect(repository.addSavedServer).toHaveBeenCalledWith({
        address: 'http://gpu-node-7:8000/v1',
        label: 'GPU node',
        preset_id: undefined,
      }),
    );
    expect(
      await within(dialog).findByText('GPU node was added. It is running, with 1 model.'),
    ).toBeVisible();
    expect(within(dialog).getByRole('button', { name: /^Done/u })).toBeVisible();
    expect(repository.updateLanguageModelConfiguration).not.toHaveBeenCalled();
  });

  it('keeps the technical facts in a details pane beside the list; Esc closes only the pane', async () => {
    const user = userEvent.setup();
    renderPage('/settings/providers?provider=vllm');
    const vllm = await row('vllm');

    await user.click(within(vllm).getByRole('button', { name: 'More for vLLM' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Details' }));

    const pane = await screen.findByRole('complementary', { name: 'vLLM' });
    expect(within(pane).getByText('Address')).toBeVisible();
    expect(within(pane).queryByText('connection refused')).toBeNull();
    await user.click(within(pane).getByRole('button', { name: 'Technical details' }));
    expect(within(pane).getByText('connection refused')).toBeVisible();
    expect(within(pane).getByText('Unreachable')).toBeVisible();
    expect(vllm).toHaveAttribute('data-selected');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'vLLM' })).toBeNull();
  });
});
