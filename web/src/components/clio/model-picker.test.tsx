import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { ClioModelPicker } from './model-picker';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

beforeEach(() => {
  setWideViewport(true);
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
    render(
      <MemoryRouter>
        <ClioModelPicker
          onChange={vi.fn()}
          options={options}
          trigger={<Button>Change model</Button>}
        />
      </MemoryRouter>,
    );

    window.localStorage.setItem('clio.hidden-providers.v1', '[]');
    act(() => window.dispatchEvent(new Event('clio:provider-visibility-changed')));
    await user.click(screen.getByRole('button', { name: 'Change model' }));

    expect(screen.getByText('Local vLLM')).toBeVisible();
  });

  it('searches model names globally while preserving provider and model columns', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MemoryRouter>
        <ClioModelPicker
          model="gpt-5.6-luna"
          onChange={onChange}
          options={options}
          provider="codex"
          trigger={<Button>Change model</Button>}
        />
      </MemoryRouter>,
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
    render(
      <MemoryRouter>
        <ClioModelPicker
          catalogStatus="loading"
          onChange={vi.fn()}
          options={options}
          trigger={<Button>Change model</Button>}
        />
      </MemoryRouter>,
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
    render(
      <MemoryRouter>
        <ClioModelPicker
          catalogStatus="error"
          onChange={vi.fn()}
          onRetryCatalog={onRetryCatalog}
          options={options}
          trigger={<Button>Change model</Button>}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    expect(screen.queryByText('Luna')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryCatalog).toHaveBeenCalledWith(undefined);
  });

  it('keeps cached choices searchable during a background refresh', async () => {
    const user = userEvent.setup();
    const onRetryCatalog = vi.fn();
    render(
      <MemoryRouter>
        <ClioModelPicker
          catalogRefreshing
          catalogStatus="ready"
          onChange={vi.fn()}
          onRetryCatalog={onRetryCatalog}
          options={options}
          provider="codex"
          trigger={<Button>Change model</Button>}
        />
      </MemoryRouter>,
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
    render(
      <MemoryRouter>
        <ClioModelPicker
          onChange={vi.fn()}
          onRetryCatalog={onRetryCatalog}
          options={options}
          provider="codex"
          trigger={<Button>Change model</Button>}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.click(screen.getByRole('button', { name: 'Refresh Codex provider and models' }));

    expect(onRetryCatalog).toHaveBeenCalledWith('codex');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('links provider configuration without mixing it into model selection', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ClioModelPicker
          onChange={vi.fn()}
          options={options}
          trigger={<Button>Change model</Button>}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.click(screen.getByRole('option', { name: /Codex/ }));
    const configurationLink = screen.getByRole('link', { name: 'Configure Codex provider' });
    expect(configurationLink).toHaveAttribute('href', '/settings/providers?provider=codex');
    expect(configurationLink.closest('[data-slot="cascader-nav"]')).not.toBeNull();
  });

  it('maps a legacy /settings/providers/<id> link to the settings route', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ClioModelPicker
          onChange={vi.fn()}
          options={options.map((option) =>
            option.providerId === 'codex'
              ? { ...option, configurationUrl: '/settings/providers/codex' }
              : option,
          )}
          trigger={<Button>Change model</Button>}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.click(screen.getByRole('option', { name: /Codex/ }));
    expect(screen.getByRole('link', { name: 'Configure Codex provider' })).toHaveAttribute(
      'href',
      '/settings/providers?provider=codex',
    );
  });

  it('shows provider health once as a hoverable visual signal', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ClioModelPicker
          onChange={vi.fn()}
          options={options}
          provider="codex"
          trigger={<Button>Change model</Button>}
        />
      </MemoryRouter>,
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
    render(
      <MemoryRouter>
        <ClioModelPicker
          onChange={vi.fn()}
          options={options}
          provider="codex"
          trigger={<Button>Change model</Button>}
        />
      </MemoryRouter>,
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
    render(
      <MemoryRouter>
        <ClioModelPicker
          model="gpt-5.6-luna"
          onChange={vi.fn()}
          options={options}
          provider="codex"
          trigger={<Button>Change model</Button>}
        />
      </MemoryRouter>,
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
    render(
      <MemoryRouter>
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
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.click(screen.getByText('ALCF'));
    expect(screen.getAllByText('Globus sign-in required')).toHaveLength(1);
    expect(screen.queryByText('Candidate A')).not.toBeInTheDocument();
    expect(screen.queryByText('Candidate B')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Configure ALCF provider' })).toHaveAttribute(
      'href',
      '/settings/providers?provider=alcf',
    );
  });

  it('shows a provider that reported no models at all, with why and where to fix it', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
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
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.click(screen.getByText('ALCF Metis'));

    expect(screen.getByText('Stored Globus token could not be refreshed.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Configure ALCF Metis provider' })).toHaveAttribute(
      'href',
      '/settings/providers?provider=alcf',
    );
    expect(screen.getByRole('link', { name: 'Set up ALCF Metis' })).toHaveAttribute(
      'href',
      '/settings/providers?provider=alcf',
    );
    expect(screen.getByTitle('ALCF Metis status: Unavailable')).toBeVisible();
  });

  it('persists hidden providers and offers a reveal control', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ClioModelPicker
          onChange={vi.fn()}
          options={options}
          provider="codex"
          trigger={<Button>Change model</Button>}
        />
      </MemoryRouter>,
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
    render(
      <MemoryRouter>
        <ClioModelPicker
          onChange={vi.fn()}
          options={options}
          provider="codex"
          trigger={<Button>Change model</Button>}
        />
      </MemoryRouter>,
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
    render(
      <MemoryRouter>
        <ClioModelPicker
          onChange={vi.fn()}
          options={many}
          provider="local-vllm"
          trigger={<Button>Change model</Button>}
        />
      </MemoryRouter>,
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
    render(
      <MemoryRouter>
        <ClioModelPicker
          onChange={vi.fn()}
          options={options}
          provider="codex"
          trigger={<Button>Change model</Button>}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.click(screen.getByRole('button', { name: 'Manage provider visibility' }));
    await user.click(screen.getByText('Local vLLM'));
    await user.click(screen.getByRole('button', { name: /Hide Local vLLM/ }));

    expect(screen.queryByText('Local vLLM')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show 1 hidden provider' })).toBeVisible();
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
