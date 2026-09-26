import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { buildModelOptions } from '@/lib/model-options';
import { catalog, catalogEntry } from '@/test-fixtures/provider-catalog';
import { setWideViewport, stripButtonNames } from '@/test-fixtures/model-picker/provider-actions';
import { ClioModelPicker } from './model-picker';
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

const presets = {
  codex: {
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
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    provider: 'openrouter',
    api_base: 'https://openrouter.ai/api/v1',
    suggested_model: '',
    requires_api_key: true,
    auth_method: 'api_key',
    is_authenticated: false,
    status: 'missing_key',
    status_message: 'missing OPENROUTER_API_KEY',
    supports_live_catalog: true,
    supports_vision: false,
  },
  claude_code: {
    id: 'claude_code',
    label: 'Claude Code',
    provider: 'claude_code',
    suggested_model: '',
    requires_api_key: false,
    auth_method: 'subscription',
    is_authenticated: false,
    status: 'install_required',
    status_message: 'Claude Code support is not installed on the connected agent.',
    supports_live_catalog: false,
    supports_vision: true,
  },
};

function configuration(...ids: Array<keyof typeof presets>) {
  return {
    configured: true,
    provider_id: 'codex',
    provider: 'codex',
    api_base: '',
    model: 'gpt-5.5',
    presets: ids.map((id) => presets[id]),
  };
}

const codexTransports = [
  { id: 'sdk', label: 'Codex (local)', health: 'ready', reason: '' },
  {
    id: 'direct',
    label: 'Direct',
    health: 'needs_auth',
    reason: 'sign-in required',
    auth: { method: 'oauth', logout: true },
  },
];

beforeEach(() => {
  repository.languageModelConfiguration.mockResolvedValue(
    configuration('codex', 'openrouter', 'claude_code'),
  );
  repository.providerCatalog.mockResolvedValue(
    catalog(
      catalogEntry(
        'codex',
        [
          { model_id: 'gpt-5.5', transport: 'sdk', modalities: ['text', 'image'] },
          { model_id: 'gpt-5.5-mini', transport: 'sdk' },
        ],
        { name: 'Codex', transports: codexTransports },
      ),
    ),
  );
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function renderAt(path: string, children = <ProvidersSettings />) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>,
  );
}

function entry(providerId: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-provider-id="${providerId}"]`);
  if (!row) throw new Error(`no list entry for ${providerId}`);
  return row;
}

describe('ProvidersSettings', () => {
  it('lists every provider once with the picker heartbeat, usable first', async () => {
    renderAt('/settings/providers');

    const nav = await screen.findByRole('navigation', { name: 'Providers' });
    await waitFor(() => expect(within(nav).getAllByRole('button')).toHaveLength(3));
    expect(within(nav).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Codex2',
      'Claude Code',
      'OpenRouter',
    ]);
    expect(entry('codex').querySelector('[data-slot="provider-heartbeat"]')).toHaveAttribute(
      'data-state',
      'healthy',
    );
    // Never checked, no catalog entry yet: neutral "needs setup", not red.
    expect(entry('openrouter').querySelector('[data-slot="provider-heartbeat"]')).toHaveAttribute(
      'data-state',
      'setup',
    );
    // With no ?provider=, the first provider's panel opens.
    expect(screen.getByRole('heading', { name: 'Codex' })).toBeVisible();
  });

  it('OpenRouter: one click on the provider and the API key field is right there', async () => {
    const user = userEvent.setup();
    renderAt('/settings/providers');

    await screen.findByRole('navigation', { name: 'Providers' });
    await user.click(within(entry('openrouter')).getByRole('button'));

    const panel = await screen.findByRole('region', { name: 'OpenRouter provider' });
    const keyField = within(panel).getByLabelText('OpenRouter API key');
    // The key entry is the panel's FIRST field: no model selector, reasoning,
    // endpoint, token or temperature field comes before (or with) it.
    expect(panel.querySelector('input, select, [role="combobox"]')).toBe(keyField);
    for (const name of ['Model', 'Reasoning effort', 'Temperature', 'Maximum output tokens']) {
      expect(within(panel).queryByRole('combobox', { name })).toBeNull();
      expect(within(panel).queryByRole('spinbutton', { name })).toBeNull();
    }
    expect(within(panel).getByText('Add your OpenRouter API key.')).toBeVisible();
  });

  it('saving a key shows the yellow heartbeat and "Saving key…" until it settles', async () => {
    let resolveSave: () => void = () => {};
    repository.saveProviderApiKey.mockImplementation(
      () => new Promise<void>((resolve) => (resolveSave = resolve)),
    );
    repository.providerHandshake.mockResolvedValue({
      models: [],
      source: 'live',
      connectivity: 'ok',
      auth: 'rejected',
      error: 'api_key_rejected',
      generated_at: '2026-08-23T05:00:00Z',
    });
    const user = userEvent.setup();
    renderAt('/settings/providers?provider=openrouter');

    await user.type(await screen.findByLabelText('OpenRouter API key'), 'sk-or-test');
    await user.click(screen.getByRole('button', { name: 'Save key' }));

    expect(await screen.findByText('Saving key…')).toBeVisible();
    expect(entry('openrouter').querySelector('[data-slot="provider-heartbeat"]')).toHaveAttribute(
      'data-state',
      'checking',
    );
    resolveSave();
    expect(await screen.findByText('Your OpenRouter API key was rejected.')).toBeVisible();
    expect(screen.queryByText('Saving key…')).not.toBeInTheDocument();
  });

  it('install-needed providers show Install and nothing else', async () => {
    renderAt('/settings/providers?provider=claude_code');

    await screen.findByRole('heading', { name: 'Claude Code' });
    expect(stripButtonNames()).toEqual(['Install']);
  });

  it('multi-transport Codex shows both halves: ready actions, "or", then Direct sign-in', async () => {
    renderAt('/settings/providers?provider=codex');

    await screen.findByRole('heading', { name: 'Codex' });
    await waitFor(() =>
      expect(stripButtonNames()).toEqual(['Verify provider', 'Refresh models', 'Sign in', 'Device code']),
    );
    const strip = document.querySelector<HTMLElement>('[data-slot="provider-action-strip"]')!;
    expect(within(strip).getByText('or')).toBeVisible();
    expect(within(strip).getByText('Direct')).toBeVisible();
    // The model list groups the local transport's models under its own heading.
    const models = document.querySelector<HTMLElement>('[data-slot="provider-models"]')!;
    expect(within(models).getByText('2 available')).toBeVisible();
    expect(within(models).getByText('Codex (local)')).toBeVisible();
    expect(within(models).getByText('gpt-5.5-mini')).toBeVisible();
  });

  it('shows availability state that used to live on Settings > Models', async () => {
    renderAt('/settings/providers?provider=codex');

    const facts = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-slot="provider-availability"]');
      if (!found) throw new Error('availability not rendered');
      return found;
    });
    expect(within(facts).getByText('Connection')).toBeVisible();
    expect(within(facts).getByText('Reachable')).toBeVisible();
    expect(within(facts).getByText('Signed in')).toBeVisible();
    expect(within(facts).getByText('Live model list')).toBeVisible();
    // The explanation sits behind the info icon, not on the page.
    expect(within(facts).getByRole('button', { name: 'About availability' })).toBeVisible();
    expect(
      screen.queryByText('Authentication and capability state reported by the connected service.'),
    ).toBeNull();
  });

  it('an API-key provider reads in API-key terms, and an unprobed connection is Not checked', async () => {
    renderAt('/settings/providers?provider=openrouter');

    const panel = await screen.findByRole('region', { name: 'OpenRouter provider' });
    expect(within(panel).getByText('Needs API key')).toBeVisible();
    const facts = panel.querySelector<HTMLElement>('[data-slot="provider-availability"]')!;
    expect(within(facts).getByText('API key needed')).toBeVisible();
    expect(within(facts).getByText('API key')).toBeVisible();
    expect(within(facts).getByText('Missing')).toBeVisible();
    expect(within(facts).getAllByText('Not checked').length).toBeGreaterThan(0);
    expect(within(facts).getByRole('button', { name: 'About connection' })).toBeVisible();
    expect(within(panel).queryByText(/Sign-in|Skipped|skipped/)).toBeNull();
  });

  it('a signed-in provider with no catalog entry yet is Ready everywhere, never "Needs setup"', async () => {
    repository.languageModelConfiguration.mockResolvedValue({
      ...configuration('codex'),
      presets: [{ ...presets.claude_code, is_authenticated: true, status: 'ready', status_message: '' }],
    });
    renderAt('/settings/providers?provider=claude_code');

    const panel = await screen.findByRole('region', { name: 'Claude Code provider' });
    expect(entry('claude_code').querySelector('[data-slot="provider-heartbeat"]')).toHaveAttribute(
      'data-state',
      'healthy',
    );
    expect(within(panel).getByText('Ready', { selector: '[data-slot="provider-state"]' })).toBeVisible();
    expect(screen.queryByText(/Needs setup/)).toBeNull();
    expect(stripButtonNames()).toEqual(['Verify provider', 'Refresh models']);
  });

  it('toggles picker visibility through the one shared store', async () => {
    const user = userEvent.setup();
    renderAt('/settings/providers?provider=openrouter');

    const toggle = await screen.findByRole('switch', { name: 'Show in model picker' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]')).toEqual([
      'openrouter',
    ]);
    await user.click(toggle);
    expect(JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]')).toEqual([]);
  });
});

describe('Settings > Providers and the model picker share one action implementation', () => {
  it('renders the same strip, with the same actions, for the same provider state', async () => {
    setWideViewport(true);
    const view = renderAt('/settings/providers?provider=codex');
    await waitFor(() => expect(stripButtonNames()).toContain('Verify provider'));
    const pageActions = stripButtonNames();
    view.unmount();

    const configurationData = configuration('codex', 'openrouter', 'claude_code');
    const catalogData = await repository.providerCatalog();
    const options = buildModelOptions({
      activeCatalogProvider: 'codex',
      activeModel: 'gpt-5.5',
      activeProvider: 'codex',
      providerCatalog: catalogData,
      presets: configurationData.presets,
    });
    const user = userEvent.setup();
    renderAt(
      '/',
      <ClioModelPicker
        onChange={vi.fn()}
        options={options}
        trigger={<Button>Change model</Button>}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.click(await screen.findByRole('option', { name: /Codex/ }));
    await waitFor(() => expect(stripButtonNames()).toContain('Verify provider'));

    expect(stripButtonNames()).toEqual(pageActions);
  });

  it('the picker strip links to the provider on Settings > Providers and closes itself', async () => {
    setWideViewport(true);
    const configurationData = configuration('codex', 'openrouter', 'claude_code');
    const options = buildModelOptions({
      activeCatalogProvider: 'codex',
      activeModel: 'gpt-5.5',
      activeProvider: 'codex',
      providerCatalog: await repository.providerCatalog(),
      presets: configurationData.presets,
    });
    const user = userEvent.setup();
    renderAt(
      '/',
      <Routes>
        <Route
          element={
            <ClioModelPicker
              onChange={vi.fn()}
              options={options}
              trigger={<Button>Change model</Button>}
            />
          }
          path="/"
        />
        <Route element={<ProvidersSettings />} path="/settings/providers" />
      </Routes>,
    );
    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.click(await screen.findByRole('option', { name: /Codex/ }));

    const link = await screen.findByRole('link', { name: 'Open Codex in Settings' });
    expect(link).toHaveAttribute('href', '/settings/providers?provider=codex');
    await user.click(link);

    expect(await screen.findByRole('region', { name: 'Codex provider' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
