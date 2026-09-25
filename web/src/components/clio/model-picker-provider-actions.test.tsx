import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

describe('ClioModelPicker provider submenu actions', () => {
    it('signed out: opening the submenu never starts a flow on its own', async () => {
      repository.languageModelConfiguration.mockResolvedValue({
        ...defaultConfiguration,
        presets: defaultConfiguration.presets.map((preset) =>
          preset.id === 'codex' ? { ...preset, is_authenticated: false } : preset,
        ),
      });
      const user = userEvent.setup();
      renderPicker(
        <ClioModelPicker onChange={vi.fn()} options={options} trigger={<Button>Change model</Button>} />,
      );

      await user.click(screen.getByRole('button', { name: 'Change model' }));
      await user.click(screen.getByRole('option', { name: /Codex/ }));
      await screen.findByRole('button', { name: 'Sign in' });

      expect(repository.authenticateProvider).not.toHaveBeenCalled();
      expect(screen.queryByLabelText('Complete Codex sign-in')).not.toBeInTheDocument();
    });

    it('signed out: an explicit click starts browser sign-in, and completion switches to the model list', async () => {
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
      expect(repository.authenticateProvider).not.toHaveBeenCalled();

      await user.click(await screen.findByRole('button', { name: 'Sign in' }));

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
      // up without any further click. Timeout exceeds the poll interval's
      // ceiling (2000ms) so this does not race the real backoff.
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

    it('single-transport providers (no transports, or exactly one) never show the "or" divider', async () => {
      repository.languageModelConfiguration.mockResolvedValue({
        ...defaultConfiguration,
        presets: [
          ...defaultConfiguration.presets,
          {
            id: 'alcf',
            label: 'ALCF',
            provider: 'argonne',
            suggested_model: '',
            requires_api_key: false,
            auth_method: 'oauth',
            is_authenticated: false,
            transports: [{ id: 'globus', label: 'Globus', health: 'unavailable' }],
          },
        ],
      });
      const user = userEvent.setup();
      renderPicker(
        <ClioModelPicker
          model="gpt-5.6-luna"
          onChange={vi.fn()}
          options={[
            ...options,
            {
              providerId: 'alcf',
              providerName: 'ALCF',
              id: '',
              kind: 'provider' as const,
              label: 'ALCF',
              available: false,
              health: 'unavailable',
            },
          ]}
          provider="codex"
          trigger={<Button>Change model</Button>}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Change model' }));
      expect(screen.queryByText('or')).not.toBeInTheDocument();

      await user.click(screen.getByText('ALCF'));
      await screen.findByRole('button', { name: 'Sign in' });
      expect(screen.queryByText('or')).not.toBeInTheDocument();
    });

    it('a provider with more than one transport splits into two halves, "or" between them', async () => {
      repository.languageModelConfiguration.mockResolvedValue({
        ...defaultConfiguration,
        presets: defaultConfiguration.presets.map((preset) =>
          preset.id === 'codex'
            ? {
                ...preset,
                transports: [
                  { id: 'sdk', label: 'Local SDK', health: 'healthy', models: 3 },
                  {
                    id: 'direct',
                    label: 'Direct',
                    health: 'unavailable',
                    auth: { is_authenticated: false, method: 'subscription' },
                  },
                ],
              }
            : preset,
        ),
      });
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

      // Never hardcoded per provider: the split renders purely because THIS
      // preset's transports array has more than one entry -- one half scoped
      // to the ready SDK transport, the other to the signed-out Direct one.
      expect(screen.getByText('or')).toBeVisible();
      expect(await screen.findByRole('button', { name: 'Check Local SDK' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeVisible();
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
