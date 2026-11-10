import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import type { ClioModelOption } from '@/lib/model-options';
import {
  capabilityRow,
  modelFacts,
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

const claude = { providerId: 'claude_code', providerName: 'Claude Code' };
const mistral = { providerId: 'mistral', providerName: 'Mistral' };

const catalog: ClioModelOption[] = [
  capabilityRow('anthropic/claude-sonnet-5', {
    inputs: ['text', 'image'],
    capabilities: ['tool_calling'],
  }),
  capabilityRow('perplexity/sonar', { free: true }),
  capabilityRow('meta/llama-4', { inputs: ['text', 'image', 'pdf'], free: true }),
  capabilityRow('stability/sdxl', {
    outputs: ['image'],
    modelType: 'image_generation',
    tasks: ['text-to-image'],
  }),
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
  renderPicker(
    <ClioModelPicker
      onChange={vi.fn()}
      options={options}
      trigger={<Button>Change model</Button>}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Change model' }));
  await screen.findByRole('combobox', { name: 'Search providers and models' });
  return user;
}

function searchField(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Search providers and models' });
}

function results(): HTMLElement {
  // Two columns are a named group; one column is the list itself.
  return (
    screen.queryByRole('group', { name: 'Providers and models' }) ?? screen.getByRole('listbox')
  );
}

function providerRow(name: string): HTMLElement | null {
  // A provider's name also heads its results; the row is the one in the providers list.
  return (
    within(results())
      .queryAllByText(name, { selector: 'span' })
      .map((label) => label.closest<HTMLElement>('[data-slot="cascader-item"]'))
      .find(Boolean) ?? null
  );
}

function resultHeaders(): string[] {
  return [...document.querySelectorAll('[data-slot="search-results-header"]')].map(
    (header) => header.textContent ?? '',
  );
}

function barCount(): string {
  return document.querySelector('[data-slot="model-count"]')?.textContent ?? '';
}

function tokens(): string[] {
  return (
    document.querySelector('[data-slot="model-picker-search"]')?.getAttribute('data-tokens') ?? ''
  )
    .split(' ')
    .filter(Boolean);
}

function panel(): HTMLElement | null {
  return document.querySelector('[data-slot="facet-panel"]');
}

describe('ClioModelPicker search counts', () => {
  it('opens "All providers" with each provider\'s match count and the hits grouped under it', async () => {
    const user = await openPicker();
    // No text yet: the default tokens alone leave 5 of the 6 models.
    expect(barCount()).toBe('5 / 6');

    await user.type(searchField(), 'son');

    expect(barCount()).toBe('3 / 6');
    expect(document.querySelector('[data-slot="search-all-providers"]')).toHaveTextContent(
      'All providers3',
    );
    const count = (name: string) =>
      providerRow(name)?.querySelector('[data-slot="provider-filter-count"]')?.textContent;
    expect(count('OpenRouter')).toBe('2');
    expect(count('Claude Code')).toBe('1');
    expect(resultHeaders().sort()).toEqual(['Claude Code1 / 1', 'OpenRouter2 / 4']);
    expect(within(results()).getByText('sonar')).toBeVisible();
  });

  it('a provider row narrows the results and keeps the search; clearing it returns to that provider', async () => {
    const user = await openPicker();
    await user.type(searchField(), 'son');

    await user.click(providerRow('Claude Code')!);

    expect(searchField()).toHaveValue('son');
    expect(within(results()).queryByText('sonar')).toBeNull();
    expect(within(results()).getAllByText('claude-sonnet-5').length).toBeGreaterThan(0);

    await user.click(document.querySelector<HTMLElement>('[data-slot="search-all-providers"]')!);
    expect(searchField()).toHaveValue('son');
    expect(within(results()).getByText('sonar')).toBeVisible();

    await user.click(providerRow('Claude Code')!);
    await user.clear(searchField());
    expect(document.querySelector('[data-slot="search-all-providers"]')).toBeNull();
    expect(providerRow('Claude Code')).toHaveAttribute('data-open');
  });

  it('keeps providers with no match listed at 0 in two columns; one column hides them and says how many', async () => {
    const user = await openPicker();
    await user.type(searchField(), 'son');
    expect(
      providerRow('Mistral')?.querySelector('[data-slot="provider-filter-count"]'),
    ).toHaveTextContent('0');
    cleanup();

    setWideViewport(false);
    const narrow = await openPicker();
    expect(providerRow('Mistral')).not.toBeNull();

    await narrow.type(searchField(), 'son');

    expect(providerRow('Mistral')).toBeNull();
    expect(document.querySelector('[data-slot="providers-without-matches"]')).toHaveTextContent(
      '1 provider with no matches',
    );

    await narrow.clear(searchField());
    expect(providerRow('Mistral')).not.toBeNull();
    expect(document.querySelector('[data-slot="providers-without-matches"]')).toBeNull();
  });

  it('a token narrows the search counts too', async () => {
    const user = await openPicker();
    await user.type(searchField(), 'son free ');

    expect(tokens()).toContain('free');
    expect(barCount()).toBe('1 / 6'); // only sonar is free
    expect(resultHeaders()).toEqual(['OpenRouter1 / 4']);
  });
});

describe('ClioModelPicker collapsible result groups (one column)', () => {
  beforeEach(() => setWideViewport(false));

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
    // The counts still describe the whole search.
    expect(barCount()).toBe('3');

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
  }, 15_000);
});

function sectionNames(): string[] {
  return within(panel()!)
    .getAllByRole('region')
    .map((section) => section.getAttribute('aria-label') ?? '');
}

function filterRow(name: RegExp): HTMLElement {
  return within(panel()!).getByRole('checkbox', { name });
}

function highlighted(): HTMLElement | null {
  return panel()!.querySelector('[data-row-key][data-selected]');
}

/** Opens the panel and its folded groups (Tasks onward). */
async function openAllFilters(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(searchField());
  const fold = document.querySelector<HTMLElement>('[data-slot="facet-fold"]');
  if (fold) await user.click(fold);
}

describe('ClioModelPicker filter panel', () => {
  it('opens under the field when it is pressed, every filter a row in the spec order', async () => {
    const user = await openPicker();
    // Opening the picker focuses the field without opening the panel.
    expect(panel()).toBeNull();

    await user.click(searchField());
    // The groups after the ranges start folded into one row.
    expect(sectionNames()).toEqual([
      'Capabilities',
      'Context',
      'Cost',
      'Released',
      'Tasks, Input, Output, Providers, Other',
    ]);
    await user.click(document.querySelector<HTMLElement>('[data-slot="facet-fold"]')!);

    // Capabilities, the sliders, then the tag groups. No model states its size: no Size.
    expect(sectionNames()).toEqual([
      'Capabilities',
      'Context',
      'Cost',
      'Released',
      'Tasks',
      'Input',
      'Output',
      'Providers',
      'Offer',
      'Role',
    ]);
    const free = filterRow(/^Free: /u);
    expect(free).toHaveAttribute('aria-checked', 'false');
    expect(free.querySelector('[data-slot="facet-chip-count"]')).toHaveTextContent('2');
    expect(within(panel()!).getByRole('slider', { name: 'Context from' })).toBeInTheDocument();
  });

  it('a row toggles its token in the search bar, and the results follow', async () => {
    const user = await openPicker();
    await openAllFilters(user);

    await user.click(filterRow(/^Free: /u));

    expect(tokens()).toEqual(['input:text', 'output:text', 'free']);
    expect(barCount()).toBe('2 / 6');
    expect(filterRow(/^Free: /u)).toHaveAttribute('aria-checked', 'true');
    // Focus never left the search field: typing still searches.
    expect(searchField()).toHaveFocus();

    await user.click(filterRow(/^Free: /u));
    expect(tokens()).toEqual(['input:text', 'output:text']);
  });

  it('a row hidden only by a default token counts what it would list and swaps that default', async () => {
    const user = await openPicker();
    await openAllFilters(user);

    const image = filterRow(/^Text-to-Image: 1 model \(replaces output:text\)$/u);
    expect(image).not.toHaveAttribute('aria-disabled');
    await user.click(image);

    expect(tokens()).toEqual(['input:text', 'task:text-to-image']);
    expect(barCount()).toBe('1 / 6');
  });

  it('a row that would list nothing cannot be toggled', async () => {
    const user = await openPicker();
    await openAllFilters(user);
    await user.click(filterRow(/^Free: /u));

    // sdxl is not free, and "free" is the person's own token: nothing to swap.
    const image = filterRow(/^Text-to-Image: 0 models$/u);
    expect(image).toHaveAttribute('aria-disabled', 'true');
    await user.click(image);
    expect(tokens()).toEqual(['input:text', 'output:text', 'free']);
  });

  it('a broad search lists every hit, so the counts and the rows agree', async () => {
    const many = Array.from({ length: 250 }, (_, index) => capabilityRow(`acme/model-${index}`));
    const user = await openPicker(many);

    await user.type(searchField(), 'model');

    expect(barCount()).toBe('250 / 250');
    // 250 model rows plus their provider's header -- never cut at 200.
    await waitFor(() =>
      expect(document.querySelector('[data-slot="cascader-status"]')).toHaveTextContent(
        '251 results',
      ),
    );
  });

  it('typing keeps it open and narrows its rows to what matches', async () => {
    const user = await openPicker();
    await openAllFilters(user);
    expect(filterRow(/^PDF: /u)).toBeVisible();

    await user.type(searchField(), 'son');

    expect(panel()).not.toBeNull();
    // Nothing matching "son" reads PDFs.
    expect(within(panel()!).queryByRole('checkbox', { name: /^PDF: /u })).toBeNull();
    expect(filterRow(/^Free: /u)).toHaveTextContent('1');
  });

  it('"Show all" lists a whole group; a large group has a name filter', async () => {
    const tasks = [
      'text-to-speech',
      'automatic-speech-recognition',
      'text-to-video',
      'feature-extraction',
      'text-ranking',
      'text-classification',
    ];
    const many = [
      ...catalog,
      ...tasks.map((task) =>
        capabilityRow(`acme/${task}`, { modelType: 'other', tasks: [task], outputs: [] }),
      ),
    ];
    const user = await openPicker(many);
    await openAllFilters(user);
    const tasksSection = () => within(panel()!).getByRole('region', { name: 'Tasks' });
    expect(within(tasksSection()).getAllByRole('checkbox')).toHaveLength(6);

    await user.click(within(panel()!).getByRole('button', { name: /^Show all \d+ Tasks$/u }));

    expect(within(tasksSection()).getAllByRole('checkbox').length).toBeGreaterThan(6);
    // The group's own kinds label its rows once it is whole.
    expect(within(tasksSection()).getByText('Audio')).toBeInTheDocument();
    const filter = within(panel()!).getByRole('textbox', { name: 'Filter Tasks by name' });
    await user.type(filter, 'speech');
    expect(within(tasksSection()).queryByText('Vision')).toBeNull();
    expect(filterRow(/^Text-to-Speech: /u)).toBeVisible();
    expect(within(panel()!).queryByRole('checkbox', { name: /^Text Generation: / })).toBeNull();

    await user.click(within(panel()!).getByRole('button', { name: 'Show fewer Tasks' }));
    expect(within(tasksSection()).getAllByRole('checkbox')).toHaveLength(6);
  }, 15_000);

  it('from the field: opens on the first row, Space toggles, PgDn jumps a group, → slides', async () => {
    const user = await openPicker();
    await user.click(searchField());

    // The spec opens Filters with its first row focused and showing ↵.
    const first = highlighted()!;
    expect(first).toHaveAttribute('role', 'checkbox');
    expect(first.closest('section')).toHaveAttribute('aria-label', 'Capabilities');
    await user.keyboard('{ArrowDown}');
    expect(highlighted()).not.toBe(first);
    await user.keyboard('{ArrowUp}');
    expect(highlighted()).toBe(first);
    await user.keyboard(' ');
    expect(first).toHaveAttribute('aria-checked', 'true');
    expect(tokens()).toContain(first.getAttribute('data-token'));
    // Space toggled the row instead of typing into the search.
    expect(searchField()).toHaveValue('');

    await user.keyboard('{PageDown}');
    expect(highlighted()).toHaveAttribute('data-range', 'context');
    await user.keyboard('{ArrowRight}');
    expect(tokens().some((token) => token.startsWith('context:'))).toBe(true);

    await user.keyboard('{PageDown}');
    expect(highlighted()).toHaveAttribute('data-range', 'cost');
    // Typing goes back to the search text.
    await user.keyboard('s');
    expect(highlighted()).toBeNull();
    expect(searchField()).toHaveValue('s');
    expect(searchField()).toHaveFocus();
  }, 15_000);

  it('folds the groups after the ranges into one row that PgDn opens', async () => {
    const user = await openPicker();
    await user.click(searchField());
    const fold = within(panel()!).getByRole('button', { name: /^Show Tasks, .* filters$/u });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(within(panel()!).queryByRole('region', { name: 'Providers' })).toBeNull();

    // PgDn walks the groups; the one after the last range opens the fold.
    for (let step = 0; step < 6 && document.querySelector('[data-slot="facet-fold"]'); step += 1) {
      await user.keyboard('{PageDown}');
    }
    expect(document.querySelector('[data-slot="facet-fold"]')).toBeNull();
    const row = highlighted()!;
    expect(row).toHaveAttribute('role', 'checkbox');
    expect(row.closest('section')).toHaveAttribute('aria-label', 'Tasks');
    expect(within(panel()!).getByRole('region', { name: 'Providers' })).toBeVisible();
  }, 15_000);

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

  it('a provider row keeps one provider’s models', async () => {
    const user = await openPicker();
    await openAllFilters(user);

    await user.click(
      within(within(panel()!).getByRole('region', { name: 'Providers' })).getByRole('checkbox', {
        name: /^Claude Code: /u,
      }),
    );

    expect(tokens()).toContain('provider:claude-code');
    expect(barCount()).toBe('1 / 6');
  });

  it('shows Size only when a listed model states its size', async () => {
    const sized = [
      ...catalog,
      capabilityRow(
        'qwen/qwen3-8b',
        {},
        { modelFacts: modelFacts('qwen/qwen3-8b', { total: 8e9 }) },
      ),
    ];
    const user = await openPicker(sized);
    await user.click(searchField());

    expect(sectionNames()).toContain('Size');
    expect(
      document.querySelector('[data-slot="quick-filters"] [data-token="size:<32B"]'),
    ).not.toBeNull();
  });
});
