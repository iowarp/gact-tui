import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { ClioModelPicker } from './model-picker';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
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
    expect(screen.getByRole('listbox', { name: 'Providers' })).toBeVisible();
    expect(screen.getByRole('listbox', { name: 'Models' })).toBeVisible();

    await user.type(screen.getByPlaceholderText('Search providers and models'), 'Qwen3');
    expect(screen.getAllByText('Local vLLM')).toHaveLength(2);
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
    expect(screen.getByRole('link', { name: 'Configure Codex' })).toHaveAttribute(
      'href',
      '/settings/providers?provider=codex',
    );
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
    expect(screen.getAllByRole('link', { name: 'Configure ALCF' })).toSatisfy(
      (links: HTMLElement[]) =>
        links.every((link) => link.getAttribute('href') === '/settings/providers?provider=alcf'),
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
    await user.click(screen.getByText('Local vLLM'));
    await user.click(screen.getByRole('button', { name: 'Hide Local vLLM' }));
    expect(JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]')).toEqual([
      'local-vllm',
    ]);
    expect(screen.queryByText('Local vLLM')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '1 hidden' }));
    expect(screen.getByText('Local vLLM')).toBeVisible();
  });
});
