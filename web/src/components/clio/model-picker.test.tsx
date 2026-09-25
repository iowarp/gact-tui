import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { ClioModelPicker } from './model-picker';

const defaultConfiguration = {
  configured: true,
  provider_id: 'codex',
  provider: 'codex',
  api_base: '',
  model: 'gpt-5.6-luna',
  presets: [
    {
      id: 'codex',
      label: 'Codex',
      provider: 'codex',
      suggested_model: 'gpt-5.6-luna',
      requires_api_key: false,
      auth_method: 'subscription',
      is_authenticated: true,
    },
    {
      id: 'local-vllm',
      label: 'Local vLLM',
      provider: 'openai',
      api_base: 'http://127.0.0.1:8000/v1',
      suggested_model: '',
      requires_api_key: false,
      auth_method: 'none',
      is_authenticated: true,
    },
  ],
};

const { repository } = vi.hoisted(() => ({
  repository: {
    languageModelConfiguration: vi.fn(),
    providerHandshake: vi.fn(),
    refreshProviderModels: vi.fn(),
    installProviderSupport: vi.fn(),
    authenticateProvider: vi.fn(),
    completeProviderAuthentication: vi.fn(),
    providerAuthStatus: vi.fn(),
    logoutProvider: vi.fn(),
    updateLanguageModelConfiguration: vi.fn(),
    providerCatalog: vi.fn(),
    providerModels: vi.fn(),
  },
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

function renderPicker(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
  repository.languageModelConfiguration.mockResolvedValue(defaultConfiguration);
});

beforeEach(() => {
  setWideViewport(true);
  repository.languageModelConfiguration.mockResolvedValue(defaultConfiguration);
});

const options = [
  {
    providerId: 'codex',
    providerName: 'Codex',
    id: 'gpt-5.6-luna',
    label: 'Luna',
    available: true,
    endpoint: 'local://codex-sdk',
    configurationUrl: '/settings/providers?provider=codex',
    freshness: '2026-08-31T12:00:00Z',
    health: 'ready',
    modalities: ['text', 'image'],
  },
  {
    providerId: 'local-vllm',
    providerName: 'Local vLLM',
    id: 'Qwen/Qwen3-VL-32B',
    label: 'Qwen3-VL-32B',
    available: true,
    endpoint: 'http://127.0.0.1:8000/v1',
    configurationUrl: '/settings/providers?provider=local-vllm',
    freshness: '2026-08-31T12:00:00Z',
    health: 'ready',
    modalities: ['text', 'image'],
  },
];

describe('ClioModelPicker', () => {
  it('applies installer provider visibility after the picker has already mounted', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('clio.hidden-providers.v1', JSON.stringify(['local-vllm']));
    renderPicker(
      <ClioModelPicker
        onChange={vi.fn()}
        options={options}
        trigger={<Button>Change model</Button>}
      />,
    );

    window.localStorage.setItem('clio.hidden-providers.v1', '[]');
    act(() => window.dispatchEvent(new Event('clio:provider-visibility-changed')));
    await user.click(screen.getByRole('button', { name: 'Change model' }));

    expect(screen.getByText('Local vLLM')).toBeVisible();
  });

  it('searches model names globally while preserving provider and model columns', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker(
      <ClioModelPicker
        model="gpt-5.6-luna"
        onChange={onChange}
        options={options}
        provider="codex"
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    expect(screen.getByRole('group', { name: 'Providers and models' })).toBeVisible();

    await user.type(screen.getByPlaceholderText('Search providers and models'), 'Qwen3');
    expect(screen.getByText('Local vLLM')).toBeVisible();
    expect(screen.queryByText('Codex')).not.toBeInTheDocument();
    await user.click(screen.getByText('Local vLLM'));
    expect(screen.getByText('Qwen3-VL-32B')).toBeVisible();
    expect(screen.queryByText('Luna')).not.toBeInTheDocument();

    await user.click(screen.getByText('Qwen3-VL-32B'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'local-vllm' }));
  });

  it('shows stable skeleton columns instead of provisional options while discovery runs', async () => {
    const user = userEvent.setup();
    renderPicker(
      <ClioModelPicker
        catalogStatus="loading"
        onChange={vi.fn()}
        options={options}
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    expect(screen.getByRole('status', { name: 'Loading available models' })).toBeVisible();
    expect(screen.queryByText('Luna')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search providers and models')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(10);
  });

  it('retries live discovery from the catalog error surface', async () => {
    const user = userEvent.setup();
    const onRetryCatalog = vi.fn();
    renderPicker(
      <ClioModelPicker
        catalogStatus="error"
        onChange={vi.fn()}
        onRetryCatalog={onRetryCatalog}
        options={options}
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    expect(screen.queryByText('Luna')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryCatalog).toHaveBeenCalledWith(undefined);
  });

  it('keeps cached choices searchable during a background refresh', async () => {
    const user = userEvent.setup();
    const onRetryCatalog = vi.fn();
    renderPicker(
      <ClioModelPicker
        catalogRefreshing
        catalogStatus="ready"
        onChange={vi.fn()}
        onRetryCatalog={onRetryCatalog}
        options={options}
        provider="codex"
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));

    expect(screen.getByPlaceholderText('Search providers and models')).toBeVisible();
    expect(screen.getByText('Codex')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Refresh Codex provider and models' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('status', { name: 'Loading available models' }),
    ).not.toBeInTheDocument();
  });

  it('refreshes the active provider explicitly without closing the picker', async () => {
    const user = userEvent.setup();
    const onRetryCatalog = vi.fn();
    renderPicker(
      <ClioModelPicker
        onChange={vi.fn()}
        onRetryCatalog={onRetryCatalog}
        options={options}
        provider="codex"
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.click(screen.getByRole('button', { name: 'Refresh Codex provider and models' }));

    expect(onRetryCatalog).toHaveBeenCalledWith('codex');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('never links out to Settings for a provider action -- everything happens in the picker', async () => {
    const user = userEvent.setup();
    renderPicker(
      <ClioModelPicker
        onChange={vi.fn()}
        options={options}
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.click(screen.getByRole('option', { name: /Codex/ }));
    expect(screen.queryByRole('link', { name: /Configure/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Set up/ })).not.toBeInTheDocument();
  });

  it('shows provider health once as a hoverable visual signal', async () => {
    const user = userEvent.setup();
    renderPicker(
      <ClioModelPicker
        onChange={vi.fn()}
        options={options}
        provider="codex"
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();

    const status = screen.getByTitle('Codex status: Ready');
    expect(status).toHaveAttribute('aria-hidden', 'true');
    expect(status).toHaveClass('text-success');
    expect(status.querySelector('svg')).toBeInTheDocument();
    await user.hover(status);
    expect(await screen.findByText('Provider status')).toBeVisible();
    expect(screen.getByText('Health: Ready')).toBeVisible();
    expect(screen.getByText('Use Manage visibility to show or hide providers.')).toBeVisible();
  });

  it('does not hide a provider when its heartbeat is clicked outside visibility mode', async () => {
    const user = userEvent.setup();
    renderPicker(
      <ClioModelPicker
        onChange={vi.fn()}
        options={options}
        provider="codex"
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.click(screen.getByTitle('Codex status: Ready'));

    expect(screen.getByText('Codex')).toBeVisible();
    expect(window.localStorage.getItem('clio.hidden-providers.v1')).toBeNull();
    expect(screen.queryByRole('button', { name: /Hide Codex/ })).not.toBeInTheDocument();
  });

  it('reflows to drill navigation instead of compressing columns on a narrow viewport', async () => {
    setWideViewport(false);
    const user = userEvent.setup();
    renderPicker(
      <ClioModelPicker
        model="gpt-5.6-luna"
        onChange={vi.fn()}
        options={options}
        provider="codex"
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    expect(screen.queryByRole('group', { name: 'Providers and models' })).not.toBeInTheDocument();
    expect(screen.getByText('Luna')).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.getByRole('option', { name: /Codex/ })).toBeVisible();
    expect(screen.getByRole('option', { name: /Local vLLM/ })).toBeVisible();
  });

  it('reports unavailable provider failures once instead of listing fake models', async () => {
    const user = userEvent.setup();
    renderPicker(
      <ClioModelPicker
        onChange={vi.fn()}
        options={[
          ...options,
          {
            providerId: 'alcf',
            providerName: 'ALCF',
            id: 'candidate-a',
            label: 'Candidate A',
            available: false,
            availabilityDetail: 'Globus sign-in required',
            health: 'unavailable',
          },
          {
            providerId: 'alcf',
            providerName: 'ALCF',
            id: 'candidate-b',
            label: 'Candidate B',
            available: false,
            availabilityDetail: 'Globus sign-in required',
            health: 'unavailable',
          },
        ]}
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.click(screen.getByText('ALCF'));
    expect(screen.getAllByText('Globus sign-in required')).toHaveLength(1);
    expect(screen.queryByText('Candidate A')).not.toBeInTheDocument();
    expect(screen.queryByText('Candidate B')).not.toBeInTheDocument();
  });

  it('shows a provider that reported no models at all, with why and where to fix it', async () => {
    const user = userEvent.setup();
    renderPicker(
      <ClioModelPicker
        onChange={vi.fn()}
        options={[
          ...options,
          {
            providerId: 'alcf',
            providerName: 'ALCF Metis',
            kind: 'provider' as const,
            id: '',
            label: 'ALCF Metis',
            available: false,
            availabilityDetail: 'Stored Globus token could not be refreshed.',
            configurationUrl: '/settings/providers?provider=alcf',
            health: 'unavailable',
          },
        ]}
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.click(screen.getByText('ALCF Metis'));

    expect(screen.getByText('Stored Globus token could not be refreshed.')).toBeVisible();
    expect(screen.getByTitle('ALCF Metis status: Unavailable')).toBeVisible();
    // No preset is reported for this provider (a catalog-only placeholder row),
    // so there is nothing to offer a specific in-place action for -- and no
    // link out to Settings either (that escape hatch is gone).
    expect(screen.queryByRole('link', { name: /Configure|Set up/ })).not.toBeInTheDocument();
  });

  it('persists hidden providers and offers a reveal control', async () => {
    const user = userEvent.setup();
    renderPicker(
      <ClioModelPicker
        onChange={vi.fn()}
        options={options}
        provider="codex"
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.click(screen.getByRole('button', { name: 'Manage provider visibility' }));
    await user.click(screen.getByText('Local vLLM'));
    await user.click(screen.getByRole('button', { name: /Hide Local vLLM/ }));
    expect(JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]')).toEqual([
      'local-vllm',
    ]);
    expect(screen.queryByText('Local vLLM')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show 1 hidden provider' }));
    expect(screen.getByText('Local vLLM')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Restore all hidden providers' }));
    expect(window.localStorage.getItem('clio.hidden-providers.v1')).toBe('[]');
    expect(
      screen.queryByRole('button', { name: 'Show 1 hidden provider' }),
    ).not.toBeInTheDocument();
  });

  it('uses a compact two-column dialog with an independently scrollable pane per column', async () => {
    const user = userEvent.setup();
    renderPicker(
      <ClioModelPicker
        onChange={vi.fn()}
        options={options}
        provider="codex"
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('sm:max-w-[56rem]');
    expect(document.querySelectorAll('[data-slot="cascader-column-bounds"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-slot="scroll-area-viewport"]')).toHaveLength(2);
  });

  it('windows a provider whose model list runs past the virtualization threshold', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 150 }, (_, index) => ({
      providerId: 'local-vllm',
      providerName: 'Local vLLM',
      id: `model-${index}`,
      label: `Model ${index}`,
      available: true,
      endpoint: 'http://127.0.0.1:8000/v1',
      health: 'ready',
    }));
    renderPicker(
      <ClioModelPicker
        onChange={vi.fn()}
        options={many}
        provider="local-vllm"
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));

    // The spacer stands in for every row, so the list still scrolls its full
    // height while only a window of rows is mounted.
    const spacer = document.querySelector<HTMLElement>('[data-slot="cascader-virtual-spacer"]');
    expect(spacer).not.toBeNull();
    expect(Number.parseFloat(spacer?.style.height ?? '0')).toBeGreaterThan(150 * 20);
    expect(document.querySelectorAll('[data-slot="cascader-item"]').length).toBeLessThan(150);
  });

  it('still hides a provider when the browser refuses to store the choice', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    const user = userEvent.setup();
    renderPicker(
      <ClioModelPicker
        onChange={vi.fn()}
        options={options}
        provider="codex"
        trigger={<Button>Change model</Button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.click(screen.getByRole('button', { name: 'Manage provider visibility' }));
    await user.click(screen.getByText('Local vLLM'));
    await user.click(screen.getByRole('button', { name: /Hide Local vLLM/ }));

    expect(screen.queryByText('Local vLLM')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show 1 hidden provider' })).toBeVisible();
    setItem.mockRestore();
  });

  describe('the provider submenu handles actions in place', () => {
    it('signed out: auto-starts browser sign-in and switches to the model list on completion', async () => {
      repository.languageModelConfiguration.mockResolvedValueOnce({
        ...defaultConfiguration,
        presets: defaultConfiguration.presets.map((preset) =>
          preset.id === 'codex' ? { ...preset, is_authenticated: false } : preset,
        ),
      });
      repository.languageModelConfiguration.mockResolvedValue({
        ...defaultConfiguration,
        presets: defaultConfiguration.presets.map((preset) =>
          preset.id === 'codex' ? { ...preset, is_authenticated: true } : preset,
        ),
      });
      repository.authenticateProvider.mockResolvedValueOnce({
        provider_id: 'codex',
        flow_id: 'flow-1',
        browser: { authorization_url: 'https://auth.openai.com/oauth/authorize?state=1', loopback: true },
        instructions: 'Continue in the browser, then paste the redirect URL here.',
      });
      repository.providerAuthStatus.mockResolvedValueOnce({ state: 'pending', reason: '' });
      repository.providerAuthStatus.mockResolvedValue({ state: 'complete', reason: '' });
      repository.providerCatalog.mockResolvedValue({ authoritative: 'live_handshake', providers: [] });
      const open = vi.spyOn(window, 'open').mockImplementation(() => window);
      const user = userEvent.setup();
      renderPicker(
        <ClioModelPicker onChange={vi.fn()} options={options} trigger={<Button>Change model</Button>} />,
      );

      await user.click(screen.getByRole('button', { name: 'Change model' }));
      await user.click(screen.getByRole('option', { name: /Codex/ }));

      await waitFor(() =>
        expect(repository.authenticateProvider).toHaveBeenCalledWith('codex', {
          force: true,
          method: 'browser',
        }),
      );
      expect(open).toHaveBeenCalledWith(
        'https://auth.openai.com/oauth/authorize?state=1',
        '_blank',
        'noopener,noreferrer',
      );
      expect(await screen.findByLabelText('Complete Codex sign-in')).toBeVisible();

      // The flow completes on its own (loopback callback) -- polling picks it
      // up without any further click. Timeout exceeds AUTH_STATUS_POLL_MS
      // (1500ms) so this does not race the real poll interval.
      await waitFor(
        () => expect(screen.queryByLabelText('Complete Codex sign-in')).not.toBeInTheDocument(),
        { timeout: 3000 },
      );
    });

    it('install required: installs the runtime and shows its typed error in place on failure', async () => {
      repository.languageModelConfiguration.mockResolvedValue({
        ...defaultConfiguration,
        presets: [
          ...defaultConfiguration.presets,
          {
            id: 'claude_code',
            label: 'Claude Code',
            provider: 'claude_code',
            suggested_model: '',
            requires_api_key: false,
            auth_method: 'subscription',
            is_authenticated: false,
            status: 'install_required',
          },
        ],
      });
      repository.installProviderSupport.mockRejectedValueOnce(new Error('Claude Code CLI not found'));
      const claudeOption = {
        providerId: 'claude_code',
        providerName: 'Claude Code',
        id: '',
        kind: 'provider' as const,
        label: 'Claude Code',
        available: false,
        health: 'unavailable',
      };
      const user = userEvent.setup();
      renderPicker(
        <ClioModelPicker
          onChange={vi.fn()}
          options={[...options, claudeOption]}
          trigger={<Button>Change model</Button>}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Change model' }));
      await user.click(screen.getByText('Claude Code'));
      await user.click(await screen.findByRole('button', { name: /Install Claude Code/ }));

      await waitFor(() => expect(repository.installProviderSupport).toHaveBeenCalledWith('claude_code'));
      expect(await screen.findByText('Claude Code CLI not found')).toBeVisible();
    });

    it('API key needed: saves the key and applies the provider with its suggested model', async () => {
      repository.languageModelConfiguration.mockResolvedValue({
        ...defaultConfiguration,
        presets: [
          ...defaultConfiguration.presets,
          {
            id: 'openai',
            label: 'OpenAI',
            provider: 'openai',
            api_base: 'https://api.openai.com/v1',
            suggested_model: 'gpt-4o-mini',
            requires_api_key: true,
            auth_method: 'api_key',
            is_authenticated: false,
          },
        ],
      });
      repository.updateLanguageModelConfiguration.mockResolvedValueOnce({
        ...defaultConfiguration,
        provider: 'openai',
        provider_id: 'openai',
        model: 'gpt-4o-mini',
      });
      const openaiOption = {
        providerId: 'openai',
        providerName: 'OpenAI',
        id: '',
        kind: 'provider' as const,
        label: 'OpenAI',
        available: false,
        health: 'unavailable',
      };
      const user = userEvent.setup();
      renderPicker(
        <ClioModelPicker
          onChange={vi.fn()}
          options={[...options, openaiOption]}
          trigger={<Button>Change model</Button>}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Change model' }));
      await user.click(screen.getByText('OpenAI'));
      await user.type(await screen.findByLabelText('OpenAI API key'), 'sk-test-key');
      await user.click(screen.getByRole('button', { name: 'Save key' }));

      await waitFor(() =>
        expect(repository.updateLanguageModelConfiguration).toHaveBeenCalledWith(
          expect.objectContaining({
            provider_id: 'openai',
            provider: 'openai',
            model: 'gpt-4o-mini',
            api_key: 'sk-test-key',
          }),
        ),
      );
    });

    it('ready: the check control shows the last result in a HoverCard on re-check', async () => {
      repository.providerHandshake.mockResolvedValueOnce({
        connectivity: 'ok',
        auth: 'ok',
        models: [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' }],
        source: 'codex_catalog',
        generated_at: '2026-09-01T00:00:00Z',
      });
      repository.providerModels.mockResolvedValue({
        provider_id: 'codex',
        models: [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' }],
        source: 'codex_catalog',
      });
      repository.providerCatalog.mockResolvedValue({ authoritative: 'live_handshake', providers: [] });
      const user = userEvent.setup();
      renderPicker(
        <ClioModelPicker
          model="gpt-5.6-luna"
          onChange={vi.fn()}
          options={options}
          provider="codex"
          trigger={<Button>Change model</Button>}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Change model' }));
      await user.click(screen.getByRole('button', { name: 'Check Codex' }));
      await waitFor(() => expect(repository.providerHandshake).toHaveBeenCalled());
      await user.hover(screen.getByRole('button', { name: 'Check Codex' }));
      expect(await screen.findByText('Provider ready')).toBeVisible();
    });
  });
});

function setWideViewport(matches: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as MediaQueryList,
  );
}
