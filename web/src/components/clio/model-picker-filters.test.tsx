import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import type { ClioModelOption } from '@/lib/model-options';
import {
  capabilityRow,
  openrouterConfiguration,
} from '@/test-fixtures/model-picker/capability-rows';
import {
  renderPicker,
  repository,
  setWideViewport,
} from '@/test-fixtures/model-picker/provider-actions';
import { ClioModelPicker } from './model-picker';
import { modelPickerCatalog } from './model-picker-catalog-loader';

// The catalog is a deferred chunk; load it once so the picker opens straight into it.
beforeAll(() => modelPickerCatalog.load(), 60_000);

vi.mock('@/hooks/use-repository', async () => {
  const fixtures = await import('@/test-fixtures/model-picker/provider-actions');
  return { useRepository: () => fixtures.repository };
});
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));

const configuration = openrouterConfiguration;
const row = capabilityRow;

const openrouter: ClioModelOption[] = [
  row('meta/llama-4', { inputs: ['text', 'image'], capabilities: ['tool_calling'] }),
  row('google/gemma-free', { free: true }),
  row('acme/pdf-reader', { inputs: ['text', 'image', 'pdf'], free: true }),
  row('openrouter/auto', { router: true, free: false }),
  row('openrouter/free', { router: true, free: true }),
  row('stability/sdxl', {
    outputs: ['image'],
    modelType: 'image_generation',
    tasks: ['text-to-image'],
  }),
  row('typesafe/jev-latest', {
    outputs: ['scores'],
    modelType: 'classification',
    tasks: ['text-classification'],
  }),
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
  return (
    document.querySelector('[data-slot="model-picker-search"]')?.getAttribute('data-tokens') ?? ''
  )
    .split(' ')
    .filter(Boolean);
}
/** The default tokens are not drawn as chips: they are switched off in the Filters panel. */
async function dropDefault(user: ReturnType<typeof userEvent.setup>, token: string): Promise<void> {
  if (!document.querySelector('[data-slot="facet-panel"]')) {
    await user.click(screen.getByRole('button', { name: /^Filters/u }));
  }
  const fold = document.querySelector<HTMLElement>('[data-slot="facet-fold"]');
  if (fold) await user.click(fold);
  const panel = document.querySelector<HTMLElement>('[data-slot="facet-panel"]')!;
  const chip = panel.querySelector(`[data-token="${token}"]`);
  if (!(chip instanceof HTMLElement)) throw new Error(`no ${token} chip in the Filters panel`);
  await user.click(chip);
  await user.keyboard('{Escape}');
}

function modelNames(): string[] {
  const column = document.querySelector('[data-slot="cascader-column-bounds"][data-depth="1"]');
  return [...(column?.querySelectorAll('[data-slot="cascader-item"]') ?? [])].map(
    (item) => item.querySelector('[data-slot="model-row-name"]')?.textContent ?? '',
  );
}

describe('ClioModelPicker filter tokens', () => {
  it('keeps the first character typed straight into the search it focused on open', async () => {
    const user = userEvent.setup();
    renderPicker(
      <ClioModelPicker
        model="meta/llama-4"
        onChange={vi.fn()}
        options={openrouter}
        provider="openrouter"
        trigger={<Button>Change model</Button>}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Change model' }));
    const input = screen.getByRole('combobox', { name: 'Search providers and models' });
    await waitFor(() => expect(input).toHaveFocus());
    // No click first: a person types into the field the picker focused, and
    // that first key is what opens the list onto the chosen model.
    await user.keyboard('q');
    expect(input).toHaveValue('q');
    await user.keyboard('wen');
    expect(input).toHaveValue('qwen');
  });

  it('includes Codex and Claude Code in Tools using catalog tags rather than the native flag', async () => {
    repository.languageModelConfiguration.mockResolvedValue({
      ...configuration,
      presets: [
        ...configuration.presets,
        {
          id: 'claude_code',
          label: 'Claude Code',
          provider: 'claude_code',
          requires_api_key: false,
          auth_method: 'subscription',
          is_authenticated: true,
        },
      ],
    });
    const candidates = [
      row(
        'account-codex-model',
        { capabilities: ['tool_calling'] },
        {
          providerId: 'codex',
          providerName: 'Codex',
          toolCalling: true,
        },
      ),
      row(
        'account-claude-model',
        { capabilities: ['tool_calling'] },
        {
          providerId: 'claude_code',
          providerName: 'Claude Code',
          toolCalling: false,
        },
      ),
      row('plain-model'),
    ];
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker(
      <ClioModelPicker
        onChange={onChange}
        options={candidates}
        provider="codex"
        trigger={<Button>Change model</Button>}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Search providers and models' }),
      'cap:tools ',
    );
    expect(tokens()).toContain('cap:tools');
    expect(count()).toHaveTextContent('2 / 3');
    expect(screen.queryByText('plain-model')).toBeNull();
    const codex = screen
      .getByText('account-codex-model')
      .closest('[data-slot="cascader-item"]') as HTMLElement;
    expect(within(codex).getByRole('img', { name: 'Tools' })).toBeVisible();
    const providers = document.querySelector(
      '[data-slot="cascader-column-bounds"][data-depth="0"]',
    ) as HTMLElement;
    await user.click(within(providers).getByText('Claude Code'));
    const claude = screen
      .getByText('account-claude-model')
      .closest('[data-slot="cascader-item"]') as HTMLElement;
    expect(within(claude).getByRole('img', { name: 'Tools' })).toBeVisible();
    expect(count()).toHaveTextContent('2 / 3');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('starts on input:text + output:text: chat models only, with a visible count', async () => {
    await openOpenRouter();

    expect(tokens()).toEqual(['input:text', 'output:text']);
    expect(count()).toHaveTextContent('5 / 7');
    // The image generator is filtered out by default, never hidden for good.
    expect(screen.queryByText('sdxl')).toBeNull();
    // The provider row says its own share.
    expect(document.querySelector('[data-slot="provider-filter-count"]')).toHaveTextContent(
      '5 / 7',
    );
    // Only the filtered share: never "5 / 6" beside a second plain count.
    const row = document
      .querySelector('[data-slot="provider-filter-count"]')
      ?.closest('[data-slot="cascader-item"]');
    expect(row?.querySelector('[data-slot="cascader-item-count"]')).toBeNull();
  });

  it('removing the default tokens shows every model, surrogates tagged for what they are', async () => {
    const user = await openOpenRouter();

    await dropDefault(user, 'input:text');
    await dropDefault(user, 'output:text');

    expect(count()).toHaveTextContent(/^7$/u); // nothing narrowed: the total alone
    const sdxl = screen.getByText('sdxl').closest('[data-slot="cascader-item"]') as HTMLElement;
    expect(within(sdxl).getByRole('img', { name: 'Surrogate' })).toBeVisible();
    expect(within(sdxl).getByRole('img', { name: 'Image generator' })).toBeVisible();
    expect(document.querySelector('[data-slot="provider-filter-count"]')).toBeNull();
    // Nothing filtered: the plain count comes back.
    const provider = screen.getByText('OpenRouter').closest('[data-slot="cascader-item"]');
    expect(provider?.querySelector('[data-slot="cascader-item-count"]')).toHaveTextContent('7');
  });

  it('picking a surrogate as the chat model says why instead of selecting it', async () => {
    const onChange = vi.fn();
    const user = await openOpenRouter(onChange);
    await dropDefault(user, 'output:text');

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

  it('a row tag is display only and chooses its model; free + input:pdf narrows to the one match', async () => {
    const onChange = vi.fn();
    const user = await openOpenRouter(onChange);

    const gemma = screen
      .getByText('gemma-free')
      .closest('[data-slot="cascader-item"]') as HTMLElement;
    await user.click(within(gemma).getByRole('img', { name: 'Free' }));
    // The facet bar filters by tags; a click on one chooses the row's model.
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.stringContaining('gemma-free') }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Change model' }));
    expect(tokens()).toEqual(['input:text', 'output:text']);
    const input = screen.getByRole('combobox', { name: 'Search providers and models' });
    await user.type(input, 'free ');
    expect(tokens()).toEqual(['input:text', 'output:text', 'free']);
    expect(count()).toHaveTextContent('3 / 7'); // gemma-free, pdf-reader, the free router

    const reader = screen
      .getByText('pdf-reader')
      .closest('[data-slot="cascader-item"]') as HTMLElement;
    expect(within(reader).getByRole('img', { name: 'PDF' })).toBeVisible();
    await user.type(input, 'input:pdf ');
    expect(tokens()).toEqual(['input:text', 'output:text', 'free', 'input:pdf']);
    await waitFor(() => expect(modelNames()).toEqual(['pdf-reader']));
  });

  it('typing a key offers the tokens that exist, and a finished token becomes a chip', async () => {
    const user = await openOpenRouter();
    const input = screen.getByRole('combobox', { name: 'Search providers and models' });

    await user.type(input, 'input:');
    // A token being typed is not a text search: the models stay listed.
    expect(modelNames()).toContain('llama-4');
    const suggestions = document.querySelector(
      '[data-slot="filter-token-suggestions"]',
    ) as HTMLElement;
    expect(
      within(suggestions)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['input:image', 'input:pdf']);
    await user.click(within(suggestions).getByRole('button', { name: 'input:image' }));
    expect(tokens()).toContain('input:image');
    expect(input).toHaveValue('');

    await user.type(input, 'cap:tools ');
    expect(tokens()).toContain('cap:tools');
    expect(count()).toHaveTextContent('1 / 7');

    await user.type(input, '{Backspace}');
    expect(tokens()).not.toContain('cap:tools');
  });

  it('pins the free router first and tags every router, and the free one as free', async () => {
    await openOpenRouter();

    expect(modelNames()[0]).toBe('free');
    const free = screen
      .getByText('free', { selector: '[data-slot="model-row-name"]' })
      .closest('[data-slot="cascader-item"]') as HTMLElement;
    expect(within(free).getByRole('img', { name: 'Router' })).toBeVisible();
    expect(within(free).getByRole('img', { name: 'Free' })).toBeVisible();
    const auto = screen.getByText('auto').closest('[data-slot="cascader-item"]') as HTMLElement;
    expect(within(auto).getByRole('img', { name: 'Router' })).toBeVisible();
    expect(within(auto).queryByRole('img', { name: 'Free' })).toBeNull(); // a known "not free" shows nothing
  });

  it('task tokens filter by model type and by Hugging Face task', async () => {
    const user = await openOpenRouter();
    const input = screen.getByRole('combobox', { name: 'Search providers and models' });
    await dropDefault(user, 'input:text');
    await dropDefault(user, 'output:text');

    await user.type(input, 'task:classification ');
    await waitFor(() => expect(modelNames()).toEqual(['jev-latest']));
    const jev = screen
      .getByText('jev-latest')
      .closest('[data-slot="cascader-item"]') as HTMLElement;
    expect(within(jev).getByRole('img', { name: 'Surrogate' })).toBeVisible();
    expect(within(jev).getByRole('img', { name: 'Classifier' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Remove task:classification' }));
    await user.type(input, 'task:text-to-image ');
    await waitFor(() => expect(modelNames()).toEqual(['sdxl']));

    await user.click(screen.getByRole('button', { name: 'Remove task:text-to-image' }));
    await user.type(input, 'role:surrogate ');
    await waitFor(() => expect(modelNames()).toEqual(['sdxl', 'jev-latest']));
  }, 20_000);

  it('a chat model whose modalities nobody stated passes the default filter but shows no text chip', async () => {
    const user = userEvent.setup();
    const unknown = row('allenai/tulu-3', {}, { capabilityTags: { model_key: 'allenai/tulu-3' } });
    renderPicker(
      <ClioModelPicker
        onChange={vi.fn()}
        options={[unknown]}
        provider="openrouter"
        trigger={<Button>Change model</Button>}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Change model' }));
    expect(count()).toHaveTextContent(/^1$/u); // listed under the default filter
    const tulu = screen.getByText('tulu-3').closest('[data-slot="cascader-item"]') as HTMLElement;
    expect(tulu.querySelector('[data-slot="model-row-facts"]')).toBeNull();
  });
});
