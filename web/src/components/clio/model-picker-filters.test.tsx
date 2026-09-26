import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import type { ModelCapabilityTags } from '@clio/core/v3';
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

const EVIDENCE = [
  {
    source: 'openrouter' as const,
    detail: "openrouter architecture.output_modalities=['image']",
    observed_at: '2026-09-26T00:00:00+00:00',
  },
] as [{ source: 'openrouter'; detail: string; observed_at: string }];

function tag<T>(value: T) {
  return { value, evidence: EVIDENCE };
}

interface TagSpec {
  inputs?: string[];
  outputs?: string[];
  capabilities?: string[];
  modelType?: string;
  tasks?: string[];
  free?: boolean;
  router?: boolean;
}

/** A service `capability_tags` record, as the provider catalog serves it. */
function tags(id: string, spec: TagSpec): ModelCapabilityTags {
  const modelType = spec.modelType;
  return {
    model_key: id,
    input_modalities: (spec.inputs ?? []).map(tag),
    output_modalities: (spec.outputs ?? []).map(tag),
    capabilities: (spec.capabilities ?? []).map(tag),
    tasks: (spec.tasks ?? []).map(tag),
    model_type: modelType ? tag(modelType) : null,
    role: modelType ? tag(modelType === 'chat' ? 'general' : 'surrogate') : null,
    free: spec.free === undefined ? null : tag(spec.free),
    router: spec.router === undefined ? null : tag(spec.router),
  } as ModelCapabilityTags;
}

function row(id: string, spec: TagSpec = {}, extra: Partial<ClioModelOption> = {}): ClioModelOption {
  return {
    providerId: 'openrouter',
    providerName: 'OpenRouter',
    id,
    label: id.split('/').at(-1) ?? id,
    available: true,
    health: 'ready',
    chatSelectable: spec.modelType ? spec.modelType === 'chat' : true,
    capabilityTags: tags(id, { inputs: ['text'], outputs: ['text'], modelType: 'chat', ...spec }),
    ...extra,
  };
}

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
    expect(count()).toHaveTextContent('5 / 7');
    // The image generator is filtered out by default, never hidden for good.
    expect(screen.queryByText('sdxl')).toBeNull();
    // The provider row says its own share.
    expect(document.querySelector('[data-slot="provider-filter-count"]')).toHaveTextContent('5 / 7');
    // Only the filtered share: never "5 / 6" beside a second plain count.
    const row = document.querySelector('[data-slot="provider-filter-count"]')?.closest('[data-slot="cascader-item"]');
    expect(row?.querySelector('[data-slot="cascader-item-count"]')).toBeNull();
  });

  it('removing the default tokens shows every model, surrogates tagged for what they are', async () => {
    const user = await openOpenRouter();

    await user.click(screen.getByRole('button', { name: 'Remove input:text' }));
    await user.click(screen.getByRole('button', { name: 'Remove output:text' }));

    expect(count()).toHaveTextContent('7 / 7');
    const sdxl = screen.getByText('sdxl').closest('[data-slot="cascader-item"]') as HTMLElement;
    expect(within(sdxl).getByText('Surrogate')).toBeVisible();
    expect(within(sdxl).getByText('Image generator')).toBeVisible();
    expect(document.querySelector('[data-slot="provider-filter-count"]')).toBeNull();
    // Nothing filtered: the plain count comes back.
    const provider = screen.getByText('OpenRouter').closest('[data-slot="cascader-item"]');
    expect(provider?.querySelector('[data-slot="cascader-item-count"]')).toHaveTextContent('7');
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
    expect(count()).toHaveTextContent('3 / 7'); // gemma-free, pdf-reader, the free router

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
    expect(count()).toHaveTextContent('1 / 7');

    await user.type(input, '{Backspace}');
    expect(tokens()).not.toContain('cap:tools');
  });

  it('pins the free router first and tags every router, and the free one as free', async () => {
    await openOpenRouter();

    expect(modelNames()[0]).toBe('free');
    const free = screen.getByText('free').closest('[data-slot="cascader-item"]') as HTMLElement;
    expect(within(free).getByText('Router')).toBeVisible();
    expect(within(free).getByText('Free')).toBeVisible();
    const auto = screen.getByText('auto').closest('[data-slot="cascader-item"]') as HTMLElement;
    expect(within(auto).getByText('Router')).toBeVisible();
    expect(within(auto).queryByText('Free')).toBeNull(); // a known "not free" shows nothing
  });

  it('task tokens filter by model type and by Hugging Face task', async () => {
    const user = await openOpenRouter();
    const input = screen.getByRole('combobox', { name: 'Search providers and models' });
    await user.click(screen.getByRole('button', { name: 'Remove input:text' }));
    await user.click(screen.getByRole('button', { name: 'Remove output:text' }));

    await user.type(input, 'task:classification ');
    await waitFor(() => expect(modelNames()).toEqual(['jev-latest']));
    const jev = screen.getByText('jev-latest').closest('[data-slot="cascader-item"]') as HTMLElement;
    expect(within(jev).getByText('Surrogate')).toBeVisible();
    expect(within(jev).getByText('Classifier')).toBeVisible();

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
    expect(count()).toHaveTextContent('1 / 1'); // listed under the default filter
    const tulu = screen.getByText('tulu-3').closest('[data-slot="cascader-item"]') as HTMLElement;
    expect(tulu.querySelector('[data-slot="model-capability-tags"]')).toBeNull();
  });
});
