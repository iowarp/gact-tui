import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SelectionActionsProvider } from './selection-actions';
import { hasToolbarContent, SurfaceToolbar, type SurfaceCapabilities } from './surface-toolbar';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// For the canonical-order test at the bottom of this file, which renders a
// REAL `ClioChart` and `ClioSelectableDataTable` (#516 review item 16: it
// used to build two synthetic `SurfaceCapabilities` objects by hand, which
// could drift from what a real component actually declares). jsdom has no
// 2D canvas; Vega probes one for text metrics at import, so this quiets that
// rather than leaving a real crash/warning. Must run before `ClioChart`
// (and therefore `vega`) is imported below.
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});
const canonicalOrderRepository = vi.hoisted(() => ({
  artifactTableExport: vi.fn(),
  artifactTableQuery: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => canonicalOrderRepository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

import { ClioChart } from './a2ui-chart';
import { ClioSelectableDataTable } from './a2ui-data-table';

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
});

afterEach(() => {
  cleanup();
});

/** "Reference this" reads the registry via context; it renders nothing outside a provider by design. */
function withSelectionActions(children: ReactNode) {
  return <SelectionActionsProvider>{children}</SelectionActionsProvider>;
}

/**
 * A renderer-contract test for the ONE shared affordance framework (G0): a
 * component declares a `SurfaceCapabilities` object, and `SurfaceToolbar`
 * renders exactly the affordances declared — nothing more, nothing less,
 * ALWAYS in the same canonical order — regardless of which component (chart,
 * map, table, ...) built it. Every per-component integration test
 * (`a2ui-chart.test.tsx` etc.) trusts this contract instead of re-proving the
 * toolbar's own rendering rules.
 *
 * Design (owner review, 2026-10-01): every button is icon-only (the visible
 * label lives in a tooltip and the accessible name), and the canonical order
 * is primary icons (Filters, Reference this, Full screen — each only if
 * declared) followed by one "More" overflow holding Download, the
 * selection/linking hint, and Copy.
 */

function opener(container: HTMLElement) {
  return within(container).getByRole('button', { name: 'More' });
}

describe('hasToolbarContent', () => {
  it('is false for no capabilities, or capabilities with nothing declared', () => {
    expect(hasToolbarContent(undefined)).toBe(false);
    expect(hasToolbarContent({})).toBe(false);
  });

  it('is true once any single affordance is declared', () => {
    expect(hasToolbarContent({ onCopy: () => true })).toBe(true);
    expect(hasToolbarContent({ selectionHint: 'hint' })).toBe(true);
  });
});

describe('SurfaceToolbar', () => {
  it('pairs pointer-events with opacity, so the invisible hover state never blocks clicks underneath it (regression: a real browser run found the toolbar swallowing clicks on the map behind it while hidden)', () => {
    render(<SurfaceToolbar capabilities={{ onCopy: () => true }} />);
    const toolbar = document.querySelector('[data-slot="surface-toolbar"]')!;
    expect(toolbar.className).toContain('[@media(hover:hover)]:pointer-events-none');
    expect(toolbar.className).toContain('[@media(hover:hover)]:group-hover:pointer-events-auto');
  });

  it('is low emphasis (not full strength) on a touch/no-hover device, per the owner\'s ruling (#516 review item 12)', () => {
    render(<SurfaceToolbar capabilities={{ onCopy: () => true }} />);
    const toolbar = document.querySelector('[data-slot="surface-toolbar"]')!;
    const classes = toolbar.className.split(/\s+/u);
    expect(classes).toContain('opacity-60');
    // The base (unprefixed) class is the low-emphasis one; `opacity-100`
    // only ever appears behind a `group-hover:`/`group-focus-within:` (or
    // `forceRevealed`) variant, never as the resting state.
    expect(classes).not.toContain('opacity-100');
  });

  it('renders nothing for a component with no declared affordances (layout/text/input)', () => {
    const { container } = render(<SurfaceToolbar capabilities={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('every button is icon-only: the visible label lives in the accessible name, not in text content', () => {
    const { container } = render(
      withSelectionActions(
        <SurfaceToolbar
          capabilities={{
            buildReference: () => ({ markdown: 'x', summary: 'x', title: 'x' }),
            fullScreen: { isOpen: false, onToggle: () => {} },
          }}
        />,
      ),
    );
    for (const button of within(container).getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
      expect(button.textContent?.trim()).toBe('');
    }
  });

  it('opens the "More" overflow to reveal the download menu, with one item per declared format', async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    const capabilities: SurfaceCapabilities = {
      exportFormats: [
        { id: 'png', label: 'PNG image', run },
        { id: 'csv', label: 'CSV data', run: vi.fn() },
      ],
    };
    const { container } = render(<SurfaceToolbar capabilities={capabilities} />);

    await user.click(opener(container));
    await user.click(screen.getByRole('menuitem', { name: /Download/ }));
    const pngItem = await screen.findByRole('menuitem', { name: 'PNG image' });
    expect(pngItem).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'CSV data' })).toBeInTheDocument();

    // A Radix submenu item's highlight state is driven by real pointer-move
    // tracking that jsdom does not simulate, so `userEvent.click` alone can
    // land before the item is "current" — fire the pointer sequence directly.
    fireEvent.pointerMove(pngItem);
    fireEvent.click(pngItem);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('shows a disabled format as disabled, not hidden', async () => {
    const user = userEvent.setup();
    const capabilities: SurfaceCapabilities = {
      exportFormats: [{ disabled: true, id: 'png', label: 'PNG image', run: vi.fn() }],
    };
    const { container } = render(<SurfaceToolbar capabilities={capabilities} />);
    await user.click(opener(container));
    await user.click(screen.getByRole('menuitem', { name: /Download/ }));
    expect(await screen.findByRole('menuitem', { name: 'PNG image' })).toHaveAttribute('data-disabled');
  });

  it('renders a copy entry in the overflow that calls onCopy and shows a transient confirmation on success', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn().mockResolvedValue(true);
    const { container } = render(<SurfaceToolbar capabilities={{ copyLabel: 'Copy value', onCopy }} />);

    await user.click(opener(container));
    await user.click(screen.getByRole('menuitem', { name: 'Copy value' }));

    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('menuitem', { name: 'Copied' })).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('never shows "Copied" on a false result -- shows a failure notice instead (#516 review item 11)', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn().mockResolvedValue(false);
    const { container } = render(<SurfaceToolbar capabilities={{ copyLabel: 'Copy value', onCopy }} />);

    await user.click(opener(container));
    await user.click(screen.getByRole('menuitem', { name: 'Copy value' }));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('menuitem', { name: 'Copied' })).not.toBeInTheDocument();
  });

  it('shows a failure notice when onCopy itself rejects', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn().mockRejectedValue(new Error('clipboard denied'));
    const { container } = render(<SurfaceToolbar capabilities={{ copyLabel: 'Copy value', onCopy }} />);

    await user.click(opener(container));
    await user.click(screen.getByRole('menuitem', { name: 'Copy value' }));

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't copy copy value",
        expect.objectContaining({ description: 'clipboard denied' }),
      ),
    );
  });

  it('shows a failure notice for every DownloadSubmenu failure mode (#516 review item 10)', async () => {
    const user = userEvent.setup();
    const cases: { description: string; error: unknown; label: string }[] = [
      { description: 'export_too_large', error: new Error('export_too_large'), label: 'Server 413' },
      { description: 'canvas returned no image data', error: new Error('canvas returned no image data'), label: 'Canvas' },
      { description: 'Failed to fetch', error: new TypeError('Failed to fetch'), label: 'Fetch' },
      { description: 'denied', error: new DOMException('denied', 'SecurityError'), label: 'Security' },
      { description: 'the export failed for an unknown reason', error: undefined, label: 'Unknown' },
    ];
    for (const testCase of cases) {
      vi.mocked(toast.error).mockClear();
      const run = vi.fn().mockRejectedValue(testCase.error);
      const capabilities: SurfaceCapabilities = {
        exportFormats: [{ id: testCase.label, label: testCase.label, run }],
      };
      const { container, unmount } = render(<SurfaceToolbar capabilities={capabilities} />);

      await user.click(opener(container));
      await user.click(screen.getByRole('menuitem', { name: /Download/ }));
      const item = await screen.findByRole('menuitem', { name: testCase.label });
      fireEvent.pointerMove(item);
      fireEvent.click(item);

      await vi.waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          `Couldn't download ${testCase.label}`,
          expect.objectContaining({ description: testCase.description }),
        ),
      );
      unmount();
    }
  });

  it('shows the selection/linking hint as an informational row in the overflow', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SurfaceToolbar capabilities={{ selectionHint: <span>Shift+drag to select an area</span> }} />,
    );
    await user.click(opener(container));
    expect(screen.getByText('Shift+drag to select an area')).toBeInTheDocument();
  });

  it('exposes the selection hint as a disabled menu item, not a bare div, so it stays in the menu\'s keyboard navigation (#516 review item 16)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SurfaceToolbar
        capabilities={{
          exportFormats: [{ id: 'csv', label: 'CSV data', run: vi.fn() }],
          selectionHint: <span>Shift+drag to select an area</span>,
        }}
      />,
    );
    await user.click(opener(container));
    const hint = screen.getByRole('menuitem', { name: 'Shift+drag to select an area' });
    expect(hint).toHaveAttribute('data-disabled');
  });

  it('renders "Reference this" as a primary icon, only when buildReference is declared', () => {
    render(
      withSelectionActions(
        <SurfaceToolbar
          capabilities={{ buildReference: () => ({ markdown: 'x', summary: 'x', title: 'x' }) }}
        />,
      ),
    );
    expect(screen.getByRole('button', { name: 'Reference this' })).toBeInTheDocument();
    // Primary, not buried in the overflow: no "More" button needed for this alone.
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
  });

  it('renders a primary full-screen toggle reflecting the declared open state', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<SurfaceToolbar capabilities={{ fullScreen: { isOpen: false, onToggle } }} />);

    const button = screen.getByRole('button', { name: 'Full screen' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await user.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders the filters slot as a primary control, as declared by the component', () => {
    render(
      <SurfaceToolbar capabilities={{ filters: { content: <button type="button">Filters</button> } }} />,
    );
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
  });

  it('stays force-revealed while the Filters popover reports itself open (#516 review item 12)', () => {
    const { rerender } = render(
      <SurfaceToolbar
        capabilities={{
          filters: { content: <button type="button">Filters</button>, isOpen: false },
        }}
      />,
    );
    const toolbar = document.querySelector('[data-slot="surface-toolbar"]')!;
    expect(toolbar.className).not.toContain('opacity-100!');

    rerender(
      <SurfaceToolbar
        capabilities={{
          filters: { content: <button type="button">Filters</button>, isOpen: true },
        }}
      />,
    );
    expect(toolbar.className).toContain('[@media(hover:hover)]:opacity-100!');
    expect(toolbar.className).toContain('[@media(hover:hover)]:pointer-events-auto!');
  });

  it('warns in dev when rendered with no ".group" ancestor, since its hover-reveal would otherwise stay silently invisible (#516 review item 12)', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<SurfaceToolbar capabilities={{ onCopy: () => true }} />);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('no ".group" ancestor'));
    errorSpy.mockRestore();
  });

  it('does not warn when a ".group" ancestor is present', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <div className="group">
        <SurfaceToolbar capabilities={{ onCopy: () => true }} />
      </div>,
    );
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('no ".group" ancestor'));
    errorSpy.mockRestore();
  });

  it('renders every slot together, in one canonical order: Filters, Reference this, Full screen, More', () => {
    const { container } = render(
      withSelectionActions(
        <SurfaceToolbar
          capabilities={{
            buildReference: () => ({ markdown: 'x', summary: 'x', title: 'x' }),
            exportFormats: [{ id: 'csv', label: 'CSV data', run: () => {} }],
            filters: { content: <button aria-label="Filters" type="button" /> },
            fullScreen: { isOpen: false, onToggle: () => {} },
            onCopy: () => true,
            selectionHint: <span>Hint</span>,
          }}
        />,
      ),
    );
    const names = within(container)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    expect(names).toEqual(['Filters', 'Reference this', 'Full screen', 'More']);
  });

  it('keeps the same relative order across two different REAL components declaring different subsets (controlled, not reordered)', () => {
    // A real `ClioChart` (declares Filters from its x/y/entity fields, plus
    // Reference this/Full screen/download) and a real
    // `ClioSelectableDataTable` (with its native Filters icon) rendered side by side, NOT two hand-built
    // `SurfaceCapabilities` objects (#516 review item 16): a synthetic object
    // can drift from what a real component actually declares and never
    // notice.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const rows = [
      { run: 'a', t: 0, v: 1.5 },
      { run: 'a', t: 1, v: 1.2 },
    ];
    const first = render(
      <QueryClientProvider client={client}>
        {withSelectionActions(
          <ClioChart componentId="chart1" data={rows} entityField="run" preset="trajectories" xField="t" yField="v" />,
        )}
      </QueryClientProvider>,
    );
    const chartOrder = within(first.container)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
      .filter((label): label is string => label !== null && label !== 'Select a run by keyboard');
    first.unmount();

    const second = render(
      <QueryClientProvider client={client}>
        {withSelectionActions(
          <ClioSelectableDataTable columns={['run', 't', 'v']} componentId="table1" rows={rows} />,
        )}
      </QueryClientProvider>,
    );
    const tableOrder = within(second.container)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
      .filter((label): label is string => label !== null);

    expect(chartOrder).toEqual([
      'Box select chart points', 'Filters', 'Reference this', 'Full screen', 'More',
    ]);
    expect(tableOrder).toEqual(['Filters', 'Reference this', 'Full screen', 'More']);
    // Every control the table DOES declare lands in the same relative
    // position the chart uses for it -- nothing reordered per component.
    for (const shared of tableOrder) {
      expect(chartOrder.indexOf(shared)).toBeGreaterThanOrEqual(0);
    }
  });
});
