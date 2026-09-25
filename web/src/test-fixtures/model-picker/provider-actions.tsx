import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

/**
 * Shared fixtures for the model picker's provider-action tests. Each test file
 * still registers its own `vi.mock` (hoisted per file) and hands it
 * {@link repository} through a dynamic import of this module.
 */

export const defaultConfiguration = {
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
      supports_logout: true,
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

export const repository = {
  languageModelConfiguration: vi.fn(),
  providerHandshake: vi.fn(),
  refreshProviderModels: vi.fn(),
  installProviderSupport: vi.fn(),
  authenticateProvider: vi.fn(),
  completeProviderAuthentication: vi.fn(),
  providerAuthStatus: vi.fn(),
  logoutProvider: vi.fn(),
  updateLanguageModelConfiguration: vi.fn(),
  saveProviderApiKey: vi.fn(),
  clearProviderApiKey: vi.fn(),
  providerCatalog: vi.fn(),
  providerModels: vi.fn(),
};

export function renderPicker(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>,
  );
}

export const options = [
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

export function mockOpenaiApiKeyPreset(): void {
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
}

export const openaiOption = {
  providerId: 'openai',
  providerName: 'OpenAI',
  id: '',
  kind: 'provider' as const,
  label: 'OpenAI',
  available: false,
  health: 'unavailable',
};

/** Every strip action's button variant: one variant for all of them. */
export function stripButtonVariants(): string[] {
  const strip = document.querySelector('[data-slot="provider-action-strip"]');
  return [
    ...new Set(
      [...(strip?.querySelectorAll('button') ?? [])].map(
        (button) => button.getAttribute('data-variant') ?? '',
      ),
    ),
  ];
}

/** The action strip's buttons, in order -- the exact per-state action set. */
export function stripButtonNames(): string[] {
  const strip = document.querySelector('[data-slot="provider-action-strip"]');
  return [...(strip?.querySelectorAll('button') ?? [])].map(
    (button) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
  );
}

export function setWideViewport(matches: boolean): void {
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
