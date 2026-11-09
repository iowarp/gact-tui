import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import * as modelTags from '@/lib/model-capability-tags';
import { capabilityRow } from '@/test-fixtures/model-picker/capability-rows';
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
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));

const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
let tags = vi.spyOn(modelTags, 'modelCapabilityTagsFromOption');
const amsc = { providerId: 'amsc_mag', providerName: 'AmSC Model Access Gateway' };
let large = Array.from({ length: 250 }, (_, index) =>
  capabilityRow(`acme/model-${index}`, {}, amsc),
);

beforeEach(() => {
  large = Array.from({ length: 250 }, (_, index) => capabilityRow(`acme/model-${index}`, {}, amsc));
  tags = vi.spyOn(modelTags, 'modelCapabilityTagsFromOption');
  setWideViewport(true);
  // jsdom has no layout; give the unchanged virtualizer a real scroll window.
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(320);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(480);
  repository.languageModelConfiguration.mockResolvedValue({ ...defaultConfiguration, presets: [] });
  repository.providerCatalog.mockResolvedValue({ authoritative: 'live_handshake', providers: [] });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});

afterEach(() => {
  cleanup();
  frames.clear();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

async function paintFrame(): Promise<void> {
  const callbacks = [...frames.values()];
  frames.clear();
  await act(async () => {
    for (const callback of callbacks) callback(performance.now());
  });
}

const search = () => screen.getByRole('combobox', { name: 'Search providers and models' });
const skeleton = () => screen.getByRole('status', { name: 'Loading available models' });

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
  const panel = document.querySelector<HTMLElement>('[data-slot="facet-panel"]')!;
  const chip = panel.querySelector(`[data-token="${token}"]`);
  if (!(chip instanceof HTMLElement))
    throw new Error(`no ${token} chip in the Filters panel: ${panel.textContent}`);
  await user.click(chip);
  await user.keyboard('{Escape}');
}

describe('model picker catalog preparation', () => {
  it('prepares the selected provider first, warms the rest later and reopens from cache', async () => {
    const user = userEvent.setup();
    const other = large.map((row) => ({
      ...row,
      providerId: 'openrouter',
      providerName: 'OpenRouter',
    }));
    renderPicker(
      <ClioModelPicker
        options={[...other, ...large]}
        provider="amsc_mag"
        onChange={vi.fn()}
        trigger={<Button>Models</Button>}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Models' }));
    expect(skeleton()).toBeVisible();
    await paintFrame();
    await paintFrame();
    expect(search()).toBeVisible();
    expect(screen.getByText('OpenRouter', { exact: true })).toBeVisible();
    expect(tags).not.toHaveBeenCalled();
    await paintFrame();
    await paintFrame();
    expect(new Set(tags.mock.calls.map(([choice]) => choice))).toEqual(new Set(large));
    expect(screen.queryByRole('status', { name: 'Loading available models' })).toBeNull();
    await paintFrame();
    expect(new Set(tags.mock.calls.map(([choice]) => choice))).toEqual(
      new Set([...large, ...other]),
    );
    await user.keyboard('{Escape}');
    tags.mockClear();
    await user.click(screen.getByRole('button', { name: 'Models' }));
    expect(skeleton()).toBeVisible();
    await paintFrame();
    await paintFrame();
    expect(search()).toBeVisible();
    expect(screen.queryByRole('status', { name: 'Loading available models' })).toBeNull();
    expect(tags).not.toHaveBeenCalled();
  });

  it('opens with a provider-labelled skeleton before doing any large catalog work', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker(
      <ClioModelPicker
        options={large}
        provider="amsc_mag"
        onChange={onChange}
        trigger={<Button>Models</Button>}
      />,
    );
    expect(tags).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Models' }));
    expect(screen.getByRole('dialog', { name: 'Choose a model' })).toBeVisible();
    expect(skeleton()).toBeVisible();
    expect(screen.getByText('Loading AmSC Model Access Gateway models…')).toBeVisible();
    // The dialog paints its skeleton before the catalog itself mounts.
    expect(
      screen.queryByRole('combobox', { name: 'Search providers and models' }),
    ).not.toBeInTheDocument();
    await paintFrame();
    await paintFrame();
    expect(search()).toBeVisible();
    expect(skeleton()).toBeVisible();
    expect(screen.getByText('Loading AmSC Model Access Gateway models…')).toBeVisible();
    expect(tags).not.toHaveBeenCalled();

    await paintFrame();
    expect(skeleton()).toBeVisible();
    expect(tags).not.toHaveBeenCalled();
    await paintFrame();
    expect(search()).toBeVisible();
    expect(search()).toHaveFocus();
    expect(new Set(tags.mock.calls.map(([choice]) => choice))).toEqual(new Set(large));
    await user.type(search(), 'model-249');
    await user.click(screen.getByRole('option', { name: /model-249/u }));
    expect(onChange).toHaveBeenCalledWith(large[249]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([false, true])(
    'cancels pending preparation when dismissed after first frame: %s',
    async (afterFrame) => {
      const user = userEvent.setup();
      renderPicker(
        <ClioModelPicker
          options={large}
          provider="amsc_mag"
          onChange={vi.fn()}
          trigger={<Button>Models</Button>}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Models' }));
      if (afterFrame) await paintFrame();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await paintFrame();
      await paintFrame();
      expect(tags).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Models' }));
      expect(skeleton()).toBeVisible();
      await paintFrame();
      expect(tags).not.toHaveBeenCalled();
      await paintFrame();
      expect(search()).toBeVisible();
    },
  );

  it('keeps the query and filters while preparing a refreshed large catalog', async () => {
    const user = userEvent.setup();
    function RefreshablePicker() {
      const [options, setOptions] = useState(large);
      return (
        <>
          <Button onClick={() => setOptions([...large, capabilityRow('acme/model-new', {}, amsc)])}>
            Refresh catalog
          </Button>
          <ClioModelPicker
            options={options}
            provider="amsc_mag"
            onChange={vi.fn()}
            trigger={<Button>Models</Button>}
          />
        </>
      );
    }
    renderPicker(<RefreshablePicker />);
    await user.click(screen.getByRole('button', { name: 'Models' }));
    await paintFrame();
    await paintFrame();
    await user.type(search(), 'model-new');
    await dropDefault(user, 'output:text');
    tags.mockClear();
    // The refresh arrives externally while the modal is open.
    act(() => screen.getByText('Refresh catalog', { selector: 'button' }).click());
    expect(screen.getByRole('status', { name: 'Loading remaining models…' })).toBeVisible();
    expect(tags).not.toHaveBeenCalled();
    await paintFrame();
    expect(screen.getByRole('status', { name: 'Loading remaining models…' })).toBeVisible();
    await paintFrame();
    expect(search()).toHaveValue('model-new');
    expect(search()).toHaveFocus();
    expect(tokens()).not.toContain('output:text');
    expect(screen.getByRole('option', { name: /model-new/u })).toBeVisible();
  });

  it('discards a scheduled catalog that was replaced before preparation', async () => {
    const user = userEvent.setup();
    const replacement = large.map((row) => ({ ...row, label: `Replacement ${row.label}` }));
    const onChange = vi.fn();
    function ReplacedPicker() {
      const [options, setOptions] = useState(large);
      return (
        <>
          <Button onClick={() => setOptions(replacement)}>Replace catalog</Button>
          <ClioModelPicker
            options={options}
            provider="amsc_mag"
            onChange={onChange}
            trigger={<Button>Models</Button>}
          />
        </>
      );
    }
    renderPicker(<ReplacedPicker />);
    await user.click(screen.getByRole('button', { name: 'Models' }));
    await paintFrame();
    await paintFrame();
    await paintFrame();
    act(() => screen.getByText('Replace catalog', { selector: 'button' }).click());
    await paintFrame();
    expect(skeleton()).toBeVisible();
    expect(tags).not.toHaveBeenCalled();
    await paintFrame();
    expect(new Set(tags.mock.calls.map(([choice]) => choice))).toEqual(new Set(replacement));
    expect(search()).toBeVisible();
  });

  it('reopens a prepared large provider windowed, never mounting every row first', async () => {
    const user = userEvent.setup();
    renderPicker(
      <ClioModelPicker
        options={large}
        provider="amsc_mag"
        onChange={vi.fn()}
        trigger={<Button>Models</Button>}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Models' }));
    for (let frame = 0; frame < 4; frame += 1) await paintFrame();
    expect(screen.getByRole('option', { name: /model-0/u })).toBeVisible();
    await user.keyboard('{Escape}');

    // Rows mounted for one commit and discarded leave records as removed nodes.
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((batch) => records.push(...batch));
    observer.observe(document.body, { childList: true, subtree: true });
    await user.click(screen.getByRole('button', { name: 'Models' }));
    await paintFrame();
    await paintFrame();
    records.push(...observer.takeRecords());
    observer.disconnect();
    const optionsIn = (nodes: NodeList[]) =>
      new Set(
        nodes
          .flatMap((list) => [...list])
          .flatMap((node) =>
            node instanceof Element ? [node, ...node.querySelectorAll('[role="option"]')] : [],
          )
          .filter((element) => element.matches('[role="option"]')),
      );
    const discarded = optionsIn(records.map((record) => record.removedNodes));
    expect(screen.getByRole('option', { name: /model-0/u })).toBeVisible();
    expect(screen.getAllByRole('option').length).toBeLessThan(large.length / 4);
    expect(discarded.size).toBeLessThan(large.length / 4);
  });

  it('prepares generic large repositories too, while small catalogs open directly', async () => {
    const user = userEvent.setup();
    const small = [capabilityRow('acme/small')];
    renderPicker(
      <ClioModelPicker options={small} onChange={vi.fn()} trigger={<Button>Models</Button>} />,
    );
    await user.click(screen.getByRole('button', { name: 'Models' }));
    expect(search()).toBeVisible();
    expect(
      screen.queryByRole('status', { name: 'Loading available models' }),
    ).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    cleanup();
    tags.mockClear();
    renderPicker(
      <ClioModelPicker
        options={large.map((row) => ({
          ...row,
          providerId: 'openrouter',
          providerName: 'OpenRouter',
        }))}
        provider="openrouter"
        onChange={vi.fn()}
        trigger={<Button>Models</Button>}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Models' }));
    expect(screen.getByText('Loading OpenRouter models…')).toBeVisible();
    expect(tags).not.toHaveBeenCalled();
    await paintFrame();
    await paintFrame();
    await waitFor(() => expect(search()).toBeVisible());
  });
});
