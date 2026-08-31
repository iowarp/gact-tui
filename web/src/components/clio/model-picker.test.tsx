import { cleanup, render, screen } from '@testing-library/react';
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
    configurationUrl: '/settings/providers/codex',
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
    configurationUrl: '/settings/providers/local-vllm',
    freshness: '2026-08-31T12:00:00Z',
    health: 'ready',
    modalities: ['text', 'image'],
  },
];

describe('ClioModelPicker', () => {
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
    await user.click(screen.getByRole('button', { name: /Local vLLM/ }));
    expect(screen.getByText('Qwen3-VL-32B')).toBeVisible();
    expect(screen.queryByText('Luna')).not.toBeInTheDocument();

    await user.click(screen.getByText('Qwen3-VL-32B'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'local-vllm' }));
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
    const configurationLink = screen.getByRole('link', { name: 'Configure Codex provider' });
    expect(configurationLink).toHaveAttribute('href', '/settings/providers?provider=codex');
    expect(configurationLink.closest('[data-slot="cascader-nav"]')).not.toBeNull();
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

    const status = screen.getByLabelText('Codex provider status: Ready');
    expect(status).toHaveClass('text-success');
    expect(status.querySelector('svg')).toBeInTheDocument();
    await user.hover(status);
    expect(await screen.findByText('Provider availability')).toBeVisible();
    expect(screen.getByText('Health: Ready')).toBeVisible();
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
    await user.click(screen.getByRole('button', { name: /ALCF/ }));
    expect(screen.getAllByText('Globus sign-in required')).toHaveLength(1);
    expect(screen.queryByText('Candidate A')).not.toBeInTheDocument();
    expect(screen.queryByText('Candidate B')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Configure ALCF provider' })).toHaveAttribute(
      'href',
      '/settings/providers?provider=alcf',
    );
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
    await user.click(screen.getByRole('button', { name: /Local vLLM/ }));
    await user.click(screen.getByRole('button', { name: 'Hide Local vLLM' }));
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
