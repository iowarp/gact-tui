import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { ClioModelPicker } from './model-picker';

afterEach(cleanup);

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
      '/settings/providers/codex',
    );
  });
});
