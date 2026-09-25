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
 * The owner's live-tested regression (re-review after 493cc859/1448175b): the
 * two-half Codex submenu never rendered even though the WIRE was correct,
 * because the zod catalog schema didn't declare `transports`/`transport` and
 * silently stripped them. Every other picker test builds `ClioModelOption[]`
 * by hand, which bypasses the decoder entirely and could not have caught
 * this. This one runs the REAL recorded `/v1/provider-catalog` JSON (the
 * fixture `@clio/core/v3` itself is tested against) through
 * `providerCatalogSchema` and `buildModelOptions`, then renders the picker.
 */
const catalogFixture = JSON.parse(
  // `import.meta.url` resolves oddly under Vitest's jsdom environment (not a
  // real `file:` URL), unlike @clio/core's own Node-environment decoder test
  // -- an absolute path from the workspace's own cwd (the `web` package
  // root, where `vitest run` is always invoked from) is what actually works
  // here.
  readFileSync(
    resolve(
      process.cwd(),
      '../packages/core/src/v3/fixtures/server-provider-payloads.json',
    ),
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
  it('renders Codex\'s two transports as labelled halves from the decoded live catalog', async () => {
    repository.languageModelConfiguration.mockResolvedValue(defaultConfiguration);

    // The exact boundary the bug lived at: parse the REAL recorded JSON with
    // the REAL schema, never a hand-built ClioModelOption fixture.
    const catalog = providerCatalogSchema.parse(catalogFixture.provider_catalog_live);
    const codexEntry = catalog.providers.find((provider) => provider.id === 'codex');
    expect(codexEntry?.transports?.map((transport) => transport.id)).toEqual(['sdk', 'direct']);
    expect(codexEntry?.models.every((model) => model.transport === 'sdk')).toBe(true);

    const options = buildModelOptions({
      activeCatalogProvider: 'codex',
      providerCatalog: catalog,
      presets: defaultConfiguration.presets,
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

    expect(screen.getByText('Codex (local)')).toBeVisible();
    expect(screen.getByText('gpt-5.6-luna')).toBeVisible();
    expect(screen.getByText('or')).toBeVisible();
    expect(screen.getByText('Direct')).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});
