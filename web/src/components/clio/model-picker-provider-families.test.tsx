import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { HIDDEN_PROVIDERS_STORAGE_KEY } from '@/hooks/use-hidden-providers';
import { capabilityRow } from '@/test-fixtures/model-picker/capability-rows';
import {
  defaultConfiguration,
  renderPicker,
  repository,
  setWideViewport,
} from '@/test-fixtures/model-picker/provider-actions';
import { ClioModelPicker } from './model-picker';
import { ALCF_SERVERS } from './model-picker-provider-families';

vi.mock('@/hooks/use-repository', async () => {
  const fixtures = await import('@/test-fixtures/model-picker/provider-actions');
  return { useRepository: () => fixtures.repository };
});
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));

const alcfOptions = Object.entries(ALCF_SERVERS).map(([providerId, name]) =>
  capabilityRow('nemotron-3-ultra', {}, { providerId, providerName: `ALCF ${name}` }),
);
const options = [...alcfOptions, capabilityRow('openrouter/other')];

beforeEach(() => {
  setWideViewport(true);
  repository.languageModelConfiguration.mockResolvedValue({
    ...defaultConfiguration,
    presets: Object.entries(ALCF_SERVERS).map(([id, name]) => ({
      id,
      label: `ALCF ${name}`,
      provider: 'argonne',
      suggested_model: '',
      auth_method: 'oauth',
      requires_api_key: false,
      is_authenticated: true,
    })),
  });
  repository.providerCatalog.mockResolvedValue({ authoritative: 'live_handshake', providers: [] });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  for (const mock of Object.values(repository)) mock.mockReset();
});

function row(name: string): HTMLElement {
  const label = screen.getByText(name, { selector: '[data-slot="cascader-item"] span' });
  const item = label.closest<HTMLElement>('[data-slot="cascader-item"]');
  if (!item) throw new Error(`Missing picker row ${name}`);
  return item;
}

describe('ALCF provider family', () => {
  it.each([true, false])(
    'expands in the provider column and keeps the selected server identity (wide=%s)',
    async (wide) => {
      setWideViewport(wide);
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderPicker(
        <ClioModelPicker onChange={onChange} options={options} trigger={<Button>Models</Button>} />,
      );
      await user.click(screen.getByRole('button', { name: 'Models' }));
      expect(screen.queryByText('Minerva')).not.toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'ALCF inference status: Ready' })).toBeInTheDocument();
      await user.click(row('ALCF inference'));
      for (const name of Object.values(ALCF_SERVERS)) expect(row(name)).toBeVisible();
      await user.click(row('Minerva'));
      await user.click(
        screen.getByText('nemotron-3-ultra', { selector: '[data-slot="model-row-name"]' }),
      );
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: 'argonne_minerva', id: 'nemotron-3-ultra' }),
      );
    },
  );

  it('hides and restores all four servers atomically without changing another provider', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(HIDDEN_PROVIDERS_STORAGE_KEY, JSON.stringify(['mistral']));
    renderPicker(
      <ClioModelPicker onChange={vi.fn()} options={options} trigger={<Button>Models</Button>} />,
    );
    await user.click(screen.getByRole('button', { name: 'Models' }));
    await user.click(screen.getByRole('button', { name: 'Hidden 1' }));
    await user.click(screen.getByRole('button', { name: 'Hide ALCF inference in this picker' }));
    expect(JSON.parse(window.localStorage.getItem(HIDDEN_PROVIDERS_STORAGE_KEY)!)).toEqual(
      [...Object.keys(ALCF_SERVERS), 'mistral'].sort(),
    );
    await user.click(screen.getByRole('button', { name: 'Show ALCF inference in this picker' }));
    expect(JSON.parse(window.localStorage.getItem(HIDDEN_PROVIDERS_STORAGE_KEY)!)).toEqual([
      'mistral',
    ]);
  });

  it('searches all collapsed servers as separate result groups', async () => {
    const user = userEvent.setup();
    renderPicker(
      <ClioModelPicker onChange={vi.fn()} options={options} trigger={<Button>Models</Button>} />,
    );
    await user.click(screen.getByRole('button', { name: 'Models' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Search providers and models' }),
      'nemotron',
    );
    for (const name of Object.values(ALCF_SERVERS)) expect(row(`ALCF ${name}`)).toBeVisible();
    expect(
      screen.getAllByText('nemotron-3-ultra', { selector: '[data-slot="model-row-name"]' }),
    ).toHaveLength(4);
    expect(screen.queryByText('ALCF inference', { selector: 'span' })).not.toBeInTheDocument();
  });
});
