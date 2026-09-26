import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
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
    // The results list groups each hit under its provider's header.
    const results = screen.getByRole('group', { name: 'Providers and models' });
    expect(within(results).getByText('Local vLLM')).toBeVisible();
    expect(within(results).queryByText('Codex')).not.toBeInTheDocument();
    expect(within(results).getByText('Qwen3-VL-32B')).toBeVisible();
    expect(within(results).queryByText('Luna')).not.toBeInTheDocument();

    await user.click(within(results).getByText('Qwen3-VL-32B'));
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
      screen.queryByRole('status', { name: 'Loading available models' }),
    ).not.toBeInTheDocument();
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
    expect(status).toHaveClass('text-success');
    expect(status.querySelector('svg')).toBeInTheDocument();
    await user.hover(status);
    expect(await screen.findByText('Provider status')).toBeVisible();
    expect(screen.getByText('Health: Ready')).toBeVisible();
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

  it('hides a provider in place while managing; it drops out only once done, and the count updates live', async () => {
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
    expect(screen.getAllByRole('button', { name: /Hidden|Done/ })).toHaveLength(1);
    // Normal mode: no eye anywhere -- "Hidden (N)" IS the manage action, so
    // there is nothing to toggle until it is clicked.
    expect(screen.queryByRole('button', { name: /Hide|Show/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hidden (0)' }));
    // Manage mode: every row -- not just the one about to be hidden -- shows
    // its own eye beside its heartbeat.
    expect(screen.getByRole('button', { name: /Hide Codex/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Hide Local vLLM/ })).toBeVisible();

    await user.click(screen.getByText('Local vLLM'));
    await user.click(screen.getByRole('button', { name: /Hide Local vLLM/ }));

    expect(JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]')).toEqual([
      'local-vllm',
    ]);
    // Still in place while managing -- hidden and shown rows stay together.
    expect(screen.getByText('Local vLLM')).toBeVisible();
    expect(screen.getByRole('button', { name: /Show Local vLLM/ })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('Local vLLM')).not.toBeInTheDocument();

    // The count reflects the change live, and re-opening reveals it again.
    await user.click(screen.getByRole('button', { name: 'Hidden (1)' }));
    expect(screen.getByText('Local vLLM')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Show Local vLLM/ }));
    expect(JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]')).toEqual([]);
    expect(screen.getByRole('button', { name: /Hide Local vLLM/ })).toBeVisible();
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

  it('nests the action row inside the active column, never a full-width row under both', async () => {
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

    expect(await screen.findByRole('button', { name: 'Refresh' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reload models' })).toBeVisible();

    const strip = document.querySelector('[data-slot="provider-panel-footer"]');
    expect(strip).not.toBeNull();

    // Depth 0 is the (now-trail) provider list; depth 1 is the active
    // provider's own model column. The strip is the LOWER SECTION of depth
    // 1's own bounded box -- never a third, full-width row below both
    // columns, which would leave an empty cell under depth 0.
    const providerColumnBounds = document.querySelector(
      '[data-slot="cascader-column-bounds"][data-depth="0"]',
    );
    const activeColumnBounds = document.querySelector(
      '[data-slot="cascader-column-bounds"][data-depth="1"]',
    );
    expect(activeColumnBounds?.contains(strip)).toBe(true);
    expect(providerColumnBounds?.contains(strip)).toBe(false);
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

  it('still marks a provider hidden in memory when the browser refuses to store the choice', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Hidden (0)' }));
    await user.click(screen.getByText('Local vLLM'));
    await user.click(screen.getByRole('button', { name: /Hide Local vLLM/ }));

    expect(screen.getByRole('button', { name: /Show Local vLLM/ })).toBeVisible();
    setItem.mockRestore();
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
