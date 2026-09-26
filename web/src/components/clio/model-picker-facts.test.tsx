import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import type { ClioModelOption } from '@/lib/model-options';
import {
  capabilityRow,
  modelFacts,
  openrouterConfiguration,
  type FactSpec,
  type TagSpec,
} from '@/test-fixtures/model-picker/capability-rows';
import { renderPicker, repository, setWideViewport } from '@/test-fixtures/model-picker/provider-actions';
import { ClioModelPicker } from './model-picker';

vi.mock('@/hooks/use-repository', async () => {
  const fixtures = await import('@/test-fixtures/model-picker/provider-actions');
  return { useRepository: () => fixtures.repository };
});
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8787' } }),
}));
const openExternalUrl = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/tauri/external-url', () => ({ openExternalUrl }));

function row(id: string, tags: TagSpec, facts: FactSpec): ClioModelOption {
  return capabilityRow(id, tags, { modelFacts: modelFacts(id, facts) });
}

const VISION = { inputs: ['text', 'image'] };
const RECENT = { released: '2026-08-01', recent: true };
const OLD = { released: '2024-01-01', recent: false };

const catalog: ClioModelOption[] = [
  row('qwen/qwen3-vl-235b', VISION, { ...RECENT, total: 235e9, price: 0.3 }),
  row('google/gemma-4-12b', VISION, { ...RECENT, total: 12e9, price: 0.05 }),
  row('mystery/vision-large', VISION, { ...RECENT, price: 2 }),
  row('meta/llama-3.2-90b-vision', VISION, { ...OLD, total: 90e9, price: 0.9 }),
  row('deepseek/deepseek-v4', {}, { ...RECENT, total: 671e9, active: 37e9, price: 0.5 }),
  row(
    'openrouter/pareto-code',
    { router: true },
    {
      ...RECENT,
      price: 'variable',
      description: 'The Pareto Router picks by Artificial Analysis scores.',
      links: [{ text: 'Artificial Analysis', url: 'https://artificialanalysis.ai/' }],
    },
  ),
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

async function openPicker() {
  const user = userEvent.setup();
  renderPicker(
    <ClioModelPicker onChange={vi.fn()} options={catalog} provider="openrouter" trigger={<Button>Change model</Button>} />,
  );
  await user.click(screen.getByRole('button', { name: 'Change model' }));
  return user;
}

const field = () => screen.getByRole('combobox', { name: 'Search providers and models' });
const panel = () => document.querySelector<HTMLElement>('[data-slot="facet-panel"]')!;
const barCount = () => document.querySelector('[data-slot="model-count"]')?.textContent ?? '';
const tokens = () =>
  [...document.querySelectorAll('[data-slot="filter-tokens"] [data-token]')].map((chip) => chip.getAttribute('data-token'));
const slider = (name: string) => within(panel()).getAllByRole('slider', { name });
const modelNames = () =>
  [...document.querySelectorAll('[data-slot="cascader-column-bounds"][data-depth="1"] [data-slot="model-row-name"]')].map(
    (name) => name.textContent,
  );

describe('ClioModelPicker model facts', () => {
  it('the demo query: recent, over 32B, image and text in, text out', async () => {
    const user = await openPicker();
    await user.type(field(), 'released:<6mo size:>32B input:image ');

    expect(tokens()).toEqual(['input:text', 'output:text', 'released:<6mo', 'size:>32B', 'input:image']);
    // A model whose size no source states is kept until "Include unknown size" is off.
    await waitFor(() => expect(modelNames()).toEqual(['qwen3-vl-235b', 'vision-large']));
    expect(barCount()).toBe('2 / 6');

    await user.click(field());
    await user.click(within(panel()).getByRole('switch', { name: 'Include unknown size' }));
    expect(tokens()).toContain('size:known');
    await waitFor(() => expect(modelNames()).toEqual(['qwen3-vl-235b']));
  }, 20_000);

  it('a typed range token moves its slider; a slider step rewrites the token', async () => {
    const user = await openPicker();
    await user.type(field(), 'size:>32B ');
    await user.click(field());

    const [low] = slider('Size from');
    const [high] = slider('Size to');
    expect(low).toHaveAttribute('aria-valuenow', '3'); // 32B
    expect(high).toHaveAttribute('aria-valuenow', '5'); // the open top
    expect(within(panel()).getByText('size:>32B')).toBeVisible();

    fireEvent.keyDown(low!, { key: 'ArrowRight' });
    expect(tokens()).toContain('size:>128B');
    expect(tokens()).not.toContain('size:>32B');
    expect(barCount()).toBe('4 / 6'); // 235B and 671B, plus the two of unknown size

    fireEvent.keyDown(low!, { key: 'Home' });
    expect(tokens().some((token) => token?.startsWith('size:'))).toBe(false);
  }, 20_000);

  it('the Cost slider bounds the input price and keeps variable prices unless told not to', async () => {
    const user = await openPicker();
    await user.type(field(), 'cost:<1 ');
    await user.click(field());
    const toggle = within(panel()).getByRole('switch', { name: 'Include variable price' });
    expect(toggle).toBeEnabled();

    // Everything but the $2 model, including the variable-priced router.
    expect(barCount()).toBe('5 / 6');
    await user.click(toggle);
    expect(tokens()).toContain('cost:metered');
    expect(barCount()).toBe('4 / 6');
  });

  it('the Released slider and the Recent chip write released:<…>', async () => {
    const user = await openPicker();
    await user.click(field());
    const recent = panel().querySelector<HTMLElement>('[data-slot="facet-recent"]')!;

    await user.click(recent);
    expect(tokens()).toContain('released:<6mo');
    expect(slider('Released')[0]).toHaveAttribute('aria-valuenow', '2');
    expect(slider('Released')[0]).toHaveAttribute('aria-valuetext', '<6mo');
    expect(barCount()).toBe('5 / 6'); // every model but the 2024 one

    fireEvent.keyDown(slider('Released')[0]!, { key: 'End' });
    expect(tokens().some((token) => token?.startsWith('released:'))).toBe(false);
    expect(recent).toHaveAttribute('aria-pressed', 'false');
  });

  it('rows carry Recent and size tags; clicking Recent filters by it', async () => {
    const user = await openPicker();
    const deepseek = screen.getByText('deepseek-v4').closest<HTMLElement>('[data-slot="cascader-item"]')!;
    expect(within(deepseek).getByText('A37B / 671B')).toBeVisible();
    await user.click(within(deepseek).getByText('Recent'));
    expect(tokens()).toContain('released:<6mo');
    expect(modelNames()).not.toContain('llama-3.2-90b-vision');
  });

  it('a router has an info mark whose card says what it is, with its links clickable', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderPicker(
      <ClioModelPicker onChange={onChange} options={catalog} provider="openrouter" trigger={<Button>Change model</Button>} />,
    );
    await user.click(screen.getByRole('button', { name: 'Change model' }));
    // Only the router gets one.
    expect(document.querySelectorAll('[data-slot="model-description-hint"]')).toHaveLength(1);

    await user.hover(screen.getByRole('img', { name: 'About pareto-code' }));
    const card = await screen.findByText(/The Pareto Router picks by/u);
    const link = within(card).getByRole('link', { name: 'Artificial Analysis' });
    await user.click(link);

    expect(openExternalUrl).toHaveBeenCalledWith('https://artificialanalysis.ai/');
    // The press never reached the row: nothing was picked.
    expect(onChange).not.toHaveBeenCalled();
  });
});
