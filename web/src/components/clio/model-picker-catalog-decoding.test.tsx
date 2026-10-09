import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { providerCatalogSchema } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { buildModelOptions } from '@/lib/model-options';
import { ClioModelPicker } from './model-picker';

/**
 * Every other picker test builds `ClioModelOption[]` by hand, which bypasses
 * the decoder entirely. This one runs the REAL recorded `/v1/provider-catalog`
 * JSON (the fixture `@clio/core/v3` itself is tested against) through
 * `providerCatalogSchema` and `buildModelOptions`, then renders the picker.
 */
const catalogFixture = JSON.parse(
  // `import.meta.url` resolves oddly under Vitest's jsdom environment (not a
  // real `file:` URL), unlike @clio/core's own Node-environment decoder test
  // -- an absolute path from the workspace's own cwd (the `web` package
  // root, where `vitest run` is always invoked from) is what actually works
  // here.
  readFileSync(
    resolve(process.cwd(), '../packages/core/src/v3/fixtures/server-provider-payloads.json'),
    'utf8',
  ),
) as Record<string, unknown>;

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
    providerComponents: vi
      .fn()
      .mockResolvedValue({ installed: true, update_available: false, components: [] }),
  },
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

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
      supports_logout: true,
      supports_live_catalog: true,
      supports_vision: true,
    },
  ],
};

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
  vi.clearAllMocks();
});

describe('the picker survives the real provider-catalog decoder', () => {
  it('renders a Direct-only Codex catalog row as one plain model list, with no transport choice', async () => {
    repository.languageModelConfiguration.mockResolvedValue(defaultConfiguration);

    // The REAL recorded JSON through the REAL schema: Codex reports only its
    // `direct` transport, so there is nothing to choose between.
    const raw = catalogFixture.provider_catalog_live as {
      providers: Array<{ id: string; transports?: Array<{ id: string }> }>;
    };
    expect(raw.providers.find((provider) => provider.id === 'codex')?.transports).toEqual([
      expect.objectContaining({ id: 'direct' }),
    ]);
    const catalog = providerCatalogSchema.parse(catalogFixture.provider_catalog_live);
    const options = buildModelOptions({
      activeCatalogProvider: 'codex',
      providerCatalog: catalog,
      presets: defaultConfiguration.presets,
    });
    const codexModels = options.filter((option) => option.providerId === 'codex');
    expect(codexModels.map((option) => option.id)).toEqual([
      'gpt-5.6-luna',
      'gpt-5.6-sol',
      'gpt-5.6-mini',
      'gpt-5.5',
    ]);

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

    for (const id of ['gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-mini', 'gpt-5.5']) {
      expect(screen.getByText(id)).toBeVisible();
    }
    // No transport headings, no "or" rule, no split groups, no per-transport log in.
    expect(screen.queryByText('SDK')).not.toBeInTheDocument();
    expect(screen.queryByText('Direct')).not.toBeInTheDocument();
    expect(screen.queryByText('or')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="cascader-column-section"]')).toBeNull();
    expect(document.querySelector('[data-transport]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();
    // The provider-level action row still offers its own sign-out.
    expect(await screen.findByRole('button', { name: 'Log out' })).toBeVisible();
  });
});
