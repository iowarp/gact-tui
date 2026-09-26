import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import type { ClioModelOption } from '@/lib/model-options';
import {
  defaultConfiguration,
  renderPicker,
  repository,
  setWideViewport,
} from '@/test-fixtures/model-picker/provider-actions';
import { ClioModelPicker } from './model-picker';

vi.mock('@/hooks/use-repository', async () => {
  const fixtures = await import('@/test-fixtures/model-picker/provider-actions');
  return { useRepository: () => fixtures.repository };
});
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

const configuration = {
  ...defaultConfiguration,
  presets: [
    ...defaultConfiguration.presets,
    {
      id: 'openrouter',
      label: 'OpenRouter',
      provider: 'openrouter',
      suggested_model: '',
      requires_api_key: true,
      auth_method: 'api_key',
      is_authenticated: true,
      status: 'ready',
    },
  ],
};

function row(id: string, extra: Partial<ClioModelOption> = {}): ClioModelOption {
  return {
    providerId: 'openrouter',
    providerName: 'OpenRouter',
    id,
    label: id.split('/').at(-1) ?? id,
    available: true,
    health: 'ready',
    chatSelectable: true,
    modalities: ['text'],
    ...extra,
  };
}

const openrouter: ClioModelOption[] = [
  row('meta/llama-4', { modalities: ['text', 'image'], toolCalling: true }),
  row('google/gemma-free', { free: true }),
  row('acme/pdf-reader', { modalities: ['text', 'image', 'pdf'], free: true }),
  row('openrouter/auto'),
  row('openrouter/free'),
  row('stability/sdxl', { chatSelectable: false, modelType: 'image_generation', modalities: ['text'] }),
];

beforeEach(() => {
  setWideViewport(true);
  repository.languageModelConfiguration.mockResolvedValue(configuration);
  repository.providerCatalog.mockResolvedValue({ authoritative: 'live_handshake', providers: [] });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
  for (const mock of Object.values(repository)) mock.mockReset();
});

async function openOpenRouter(onChange = vi.fn()) {
  const user = userEvent.setup();
  renderPicker(
    <ClioModelPicker
      onChange={onChange}
      options={openrouter}
      provider="openrouter"
      trigger={<Button>Change model</Button>}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Change model' }));
  return user;
}

function count(): HTMLElement | null {
  return document.querySelector('[data-slot="model-count"]');
}

function tokens(): string[] {
  return [...document.querySelectorAll('[data-slot="filter-tokens"] [data-token]')].map(
    (chip) => chip.getAttribute('data-token') ?? '',
  );
}

function modelNames(): string[] {
  const column = document.querySelector('[data-slot="cascader-column-bounds"][data-depth="1"]');
  return [...(column?.querySelectorAll('[data-slot="cascader-item"]') ?? [])].map(
    (item) => item.querySelector('[data-slot="model-row-name"]')?.textContent ?? '',
  );
}

describe('ClioModelPicker filter tokens', () => {
  it('starts on input:text + output:text: chat models only, with a visible count', async () => {
    await openOpenRouter();

    expect(tokens()).toEqual(['input:text', 'output:text']);
    expect(count()).toHaveTextContent('5 / 6');
    // The image generator is filtered out by default, never hidden for good.
    expect(screen.queryByText('sdxl')).toBeNull();
    // The provider row says its own share.
    expect(document.querySelector('[data-slot="provider-filter-count"]')).toHaveTextContent('5 / 6');
  });

  it('removing the default tokens shows every model, surrogates tagged for what they are', async () => {
    const user = await openOpenRouter();

    await user.click(screen.getByRole('button', { name: 'Remove input:text' }));
    await user.click(screen.getByRole('button', { name: 'Remove output:text' }));

    expect(count()).toHaveTextContent('6 / 6');
    const sdxl = screen.getByText('sdxl').closest('[data-slot="cascader-item"]') as HTMLElement;
    expect(within(sdxl).getByText('Surrogate')).toBeVisible();
    expect(within(sdxl).getByText('Image generator')).toBeVisible();
    expect(document.querySelector('[data-slot="provider-filter-count"]')).toBeNull();
  });

  it('picking a surrogate as the chat model says why instead of selecting it', async () => {
    const onChange = vi.fn();
    const user = await openOpenRouter(onChange);
    await user.click(screen.getByRole('button', { name: 'Remove output:text' }));

    await user.click(screen.getByText('sdxl'));

    expect(onChange).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Image generators can't hold a conversation.",
    );
    expect(screen.getByRole('dialog')).toBeVisible();
    // The refused row is not left looking chosen.
    const sdxl = screen.getByText('sdxl').closest('[data-slot="cascader-item"]');
    expect(sdxl).not.toHaveAttribute('aria-selected', 'true');
  });

  it('clicking a row tag adds its token; free + input:pdf narrows to the one match', async () => {
    const user = await openOpenRouter();

    const gemma = screen.getByText('gemma-free').closest('[data-slot="cascader-item"]') as HTMLElement;
    await user.click(within(gemma).getByText('Free'));
    expect(tokens()).toEqual(['input:text', 'output:text', 'free']);
    expect(count()).toHaveTextContent('2 / 6');

    const reader = screen.getByText('pdf-reader').closest('[data-slot="cascader-item"]') as HTMLElement;
    await user.click(within(reader).getByText('PDF'));
    expect(tokens()).toEqual(['input:text', 'output:text', 'free', 'input:pdf']);
    await waitFor(() => expect(modelNames()).toEqual(['pdf-reader']));
  });

  it('typing a key offers the tokens that exist, and a finished token becomes a chip', async () => {
    const user = await openOpenRouter();
    const input = screen.getByRole('combobox', { name: 'Search providers and models' });

    await user.type(input, 'input:');
    // A token being typed is not a text search: the models stay listed.
    expect(modelNames()).toContain('llama-4');
    const suggestions = document.querySelector('[data-slot="filter-token-suggestions"]') as HTMLElement;
    expect(within(suggestions).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'input:image',
      'input:pdf',
    ]);
    await user.click(within(suggestions).getByRole('button', { name: 'input:image' }));
    expect(tokens()).toContain('input:image');
    expect(input).toHaveValue('');

    await user.type(input, 'cap:tools ');
    expect(tokens()).toContain('cap:tools');
    expect(count()).toHaveTextContent('1 / 6');

    await user.type(input, '{Backspace}');
    expect(tokens()).not.toContain('cap:tools');
  });

  it('pins the free router first and tags the other routers', async () => {
    await openOpenRouter();

    expect(modelNames()[0]).toBe('free');
    const free = screen.getByText('free').closest('[data-slot="cascader-item"]') as HTMLElement;
    expect(within(free).getByText('Free router')).toBeVisible();
    const auto = screen.getByText('auto').closest('[data-slot="cascader-item"]') as HTMLElement;
    expect(within(auto).getByText('Router')).toBeVisible();
  });
});
