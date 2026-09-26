import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import type { ClioModelOption } from '@/lib/model-options';
import { capabilityRow, openrouterConfiguration } from '@/test-fixtures/model-picker/capability-rows';
import { renderPicker, repository, setWideViewport } from '@/test-fixtures/model-picker/provider-actions';
import { ClioModelPicker } from './model-picker';

vi.mock('@/hooks/use-repository', async () => {
  const fixtures = await import('@/test-fixtures/model-picker/provider-actions');
  return { useRepository: () => fixtures.repository };
});
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));

const claude = { providerId: 'claude_code', providerName: 'Claude Code' };
const mistral = { providerId: 'mistral', providerName: 'Mistral' };

const catalog: ClioModelOption[] = [
  capabilityRow('anthropic/claude-sonnet-5', { inputs: ['text', 'image'], capabilities: ['tool_calling'] }),
  capabilityRow('perplexity/sonar', { free: true }),
  capabilityRow('meta/llama-4', { inputs: ['text', 'image', 'pdf'], free: true }),
  capabilityRow('stability/sdxl', { outputs: ['image'], modelType: 'image_generation', tasks: ['text-to-image'] }),
  capabilityRow('claude-sonnet-5', { inputs: ['text', 'image'] }, claude),
  capabilityRow('mistral/large', {}, mistral),
];

beforeEach(() => {
  setWideViewport(true);
  repository.languageModelConfiguration.mockResolvedValue(openrouterConfiguration);
  repository.providerCatalog.mockResolvedValue({ authoritative: 'live_handshake', providers: [] });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
  for (const mock of Object.values(repository)) mock.mockReset();
});

async function openPicker(options: ClioModelOption[] = catalog) {
  const user = userEvent.setup();
  renderPicker(<ClioModelPicker onChange={vi.fn()} options={options} trigger={<Button>Change model</Button>} />);
  await user.click(screen.getByRole('button', { name: 'Change model' }));
  return user;
}

function searchField(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Search providers and models' });
}

function results(): HTMLElement {
  return screen.getByRole('group', { name: 'Providers and models' });
}

function providerRow(name: string): HTMLElement | null {
  const label = within(results()).queryByText(name, { selector: 'span' });
  return label?.closest<HTMLElement>('[data-slot="cascader-item"]') ?? null;
}

function barCount(): string {
  return document.querySelector('[data-slot="model-count"]')?.textContent ?? '';
}

function tokens(): string[] {
  return [...document.querySelectorAll('[data-slot="filter-tokens"] [data-token]')].map(
    (chip) => chip.getAttribute('data-token') ?? '',
  );
}

function panel(): HTMLElement | null {
  return document.querySelector('[data-slot="facet-panel"]');
}

describe('ClioModelPicker search counts', () => {
  it('shows matches / total in the bar and per provider, counting text and tokens together', async () => {
    const user = await openPicker();
    // No text yet: the default tokens alone leave 5 of the 6 models.
    expect(barCount()).toBe('5 / 6');

    await user.type(searchField(), 'son');

    expect(barCount()).toBe('3 / 6');
    const openrouter = providerRow('OpenRouter')!;
    expect(openrouter.querySelector('[data-slot="provider-filter-count"]')).toHaveTextContent('2 / 4');
    expect(providerRow('Claude Code')?.querySelector('[data-slot="provider-filter-count"]')).toHaveTextContent('1 / 1');
    // The provider row's own trailing count and drill chevron give way to the group's.
    expect(openrouter.querySelector('[data-slot="provider-group-chevron"]')).not.toBeNull();
  });

  it('hides providers with no match during a search and says how many', async () => {
    const user = await openPicker();
    expect(providerRow('Mistral')).not.toBeNull();

    await user.type(searchField(), 'son');

    expect(providerRow('Mistral')).toBeNull();
    expect(document.querySelector('[data-slot="providers-without-matches"]')).toHaveTextContent(
      '1 provider with no matches',
    );

    await user.clear(searchField());
    expect(providerRow('Mistral')).not.toBeNull();
    expect(document.querySelector('[data-slot="providers-without-matches"]')).toBeNull();
  });

  it('a token narrows the search counts too', async () => {
    const user = await openPicker();
    await user.type(searchField(), 'son free ');

    expect(tokens()).toContain('free');
    expect(barCount()).toBe('1 / 6'); // only sonar is free
    expect(providerRow('Claude Code')).toBeNull();
  });
});

describe('ClioModelPicker collapsible result groups', () => {
  it('pressing a provider header folds its rows, keeps the search, and unfolds again', async () => {
    const user = await openPicker();
    await user.type(searchField(), 'son');
    expect(within(results()).getByText('sonar')).toBeVisible();

    await user.click(providerRow('OpenRouter')!);

    expect(searchField()).toHaveValue('son');
    // The row press hands focus back to the field; that alone never opens the panel.
    expect(panel()).toBeNull();
    expect(within(results()).queryByText('sonar')).toBeNull();
    expect(providerRow('OpenRouter')?.querySelector('[data-collapsed]')).not.toBeNull();
    // The other group is untouched.
    expect(providerRow('Claude Code')).not.toBeNull();
    expect(within(results()).getAllByText('claude-sonnet-5')).toHaveLength(1);
    // The counts still describe the whole group.
    expect(barCount()).toBe('3 / 6');

    await user.click(providerRow('OpenRouter')!);
    expect(within(results()).getByText('sonar')).toBeVisible();
    expect(providerRow('OpenRouter')?.querySelector('[data-collapsed]')).toBeNull();
  });

  it('remembers the fold while the picker is open, and starts unfolded next time', async () => {
    const user = await openPicker();
    await user.type(searchField(), 'son');
    await user.click(providerRow('OpenRouter')!);

    await user.type(searchField(), 'a'); // "sona"
    expect(providerRow('OpenRouter')?.querySelector('[data-collapsed]')).not.toBeNull();

    await user.keyboard('{Escape}');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Change model' }));
    await user.type(searchField(), 'son');
    expect(within(results()).getByText('sonar')).toBeVisible();
  });
});

describe('ClioModelPicker filter panel', () => {
  it('opens under the field when it is pressed, with the tabs and the Main clusters', async () => {
    const user = await openPicker();
    // Opening the picker focuses the field without opening the panel.
    expect(panel()).toBeNull();

    await user.click(searchField());

    const facets = panel()!;
    expect(within(facets).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Main',
      'Tasks',
      'Input',
      'Output',
      'Capabilities',
      'Providers',
      'Other',
    ]);
    const headings = within(facets).getAllByRole('heading').map((heading) => heading.textContent);
    expect(headings).toEqual(['Tasks', 'Input', 'Output', 'Capabilities', 'Providers', 'Offer', 'Role']);
    const free = within(facets).getByRole('button', { name: /^Free: / });
    expect(free).toHaveAttribute('aria-pressed', 'false');
    expect(free.querySelector('[data-slot="facet-chip-count"]')).toHaveTextContent('2');
  });

  it('a chip toggles its token in the search bar, and the results follow', async () => {
    const user = await openPicker();
    await user.click(searchField());

    await user.click(within(panel()!).getByRole('button', { name: /^Free: / }));

    expect(tokens()).toEqual(['input:text', 'output:text', 'free']);
    expect(barCount()).toBe('2 / 6');
    expect(within(panel()!).getByRole('button', { name: /^Free: / })).toHaveAttribute('aria-pressed', 'true');
    // Focus never left the search field: typing still searches.
    expect(searchField()).toHaveFocus();

    await user.click(within(panel()!).getByRole('button', { name: /^Free: / }));
    expect(tokens()).toEqual(['input:text', 'output:text']);
  });

  it('typing keeps it open and narrows its chips to what matches', async () => {
    const user = await openPicker();
    await user.click(searchField());
    expect(within(panel()!).getByRole('button', { name: /^PDF: / })).toBeVisible();

    await user.type(searchField(), 'son');

    expect(panel()).not.toBeNull();
    // Nothing matching "son" reads PDFs.
    expect(within(panel()!).queryByRole('button', { name: /^PDF: / })).toBeNull();
    expect(within(panel()!).getByRole('button', { name: /^Free: / })).toHaveTextContent('1');
  });

  it('"+N" opens the group tab; a tab with many chips has a name filter', async () => {
    const tasks = ['text-to-speech', 'automatic-speech-recognition', 'text-to-video', 'feature-extraction', 'text-ranking', 'text-classification'];
    const many = [
      ...catalog,
      ...tasks.map((task) => capabilityRow(`acme/${task}`, { modelType: 'other', tasks: [task], outputs: [] })),
    ];
    const user = await openPicker(many);
    await user.click(searchField());

    const more = within(panel()!).getByRole('button', { name: /more Tasks$/u });
    await user.click(more);

    expect(within(panel()!).getByRole('tab', { name: 'Tasks' })).toHaveAttribute('aria-selected', 'true');
    const sections = within(panel()!).getAllByRole('heading').map((heading) => heading.textContent);
    expect(sections).toEqual(['Vision', 'Language', 'Audio']);
    const filter = within(panel()!).getByRole('textbox', { name: 'Filter Tasks by name' });
    await user.type(filter, 'speech');
    expect(within(panel()!).getAllByRole('heading').map((heading) => heading.textContent)).toEqual(['Audio']);
    expect(within(panel()!).getByRole('button', { name: /^Text-to-Speech: / })).toBeVisible();
    expect(within(panel()!).queryByRole('button', { name: /^Text Generation: / })).toBeNull();
  });

  it('Escape closes the panel first and the picker second; a press outside closes it too', async () => {
    const user = await openPicker();
    await user.click(searchField());
    expect(panel()).not.toBeNull();

    await user.keyboard('{Escape}');
    expect(panel()).toBeNull();
    expect(screen.getByRole('dialog')).toBeVisible();

    await user.click(searchField());
    expect(panel()).not.toBeNull();
    await user.click(document.querySelector('[data-slot="provider-visibility-mode"]')!);
    expect(panel()).toBeNull();

    // From the keyboard: Alt+ArrowDown in the field.
    searchField().focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(panel()).not.toBeNull();
    await user.keyboard('{Escape}');
    expect(panel()).toBeNull();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a provider chip keeps one provider’s models', async () => {
    const user = await openPicker();
    await user.click(searchField());
    await user.click(within(panel()!).getByRole('tab', { name: 'Providers' }));

    await user.click(within(panel()!).getByRole('button', { name: /^Claude Code: / }));

    expect(tokens()).toContain('provider:claude-code');
    expect(barCount()).toBe('1 / 6');
  });
});
