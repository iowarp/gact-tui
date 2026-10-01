import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectionActionsProvider } from './selection-actions';
import { hasToolbarContent, SurfaceToolbar, type SurfaceCapabilities } from './surface-toolbar';

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
    expect(hasToolbarContent({ onCopy: () => {} })).toBe(true);
    expect(hasToolbarContent({ selectionHint: 'hint' })).toBe(true);
  });
});

describe('SurfaceToolbar', () => {
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

  it('renders a copy entry in the overflow that calls onCopy and shows a transient confirmation', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<SurfaceToolbar capabilities={{ copyLabel: 'Copy value', onCopy }} />);

    await user.click(opener(container));
    await user.click(screen.getByRole('menuitem', { name: 'Copy value' }));

    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('menuitem', { name: 'Copied' })).toBeInTheDocument();
  });

  it('shows the selection/linking hint as an informational row in the overflow', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SurfaceToolbar capabilities={{ selectionHint: <span>Shift+drag to select an area</span> }} />,
    );
    await user.click(opener(container));
    expect(screen.getByText('Shift+drag to select an area')).toBeInTheDocument();
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
    render(<SurfaceToolbar capabilities={{ filters: <button type="button">Filters</button> }} />);
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
  });

  it('renders every slot together, in one canonical order: Filters, Reference this, Full screen, More', () => {
    const { container } = render(
      withSelectionActions(
        <SurfaceToolbar
          capabilities={{
            buildReference: () => ({ markdown: 'x', summary: 'x', title: 'x' }),
            exportFormats: [{ id: 'csv', label: 'CSV data', run: () => {} }],
            filters: <button aria-label="Filters" type="button" />,
            fullScreen: { isOpen: false, onToggle: () => {} },
            onCopy: () => {},
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

  it('keeps the same relative order across two different components declaring different subsets (controlled, not reordered)', () => {
    // Simulates a chart (full set) and a table (download + reference + full
    // screen only, no filters/copy/selection) rendering side by side: the
    // controls they share must land in the same relative order in both.
    const chartLike: SurfaceCapabilities = {
      buildReference: () => ({ markdown: 'x', summary: 'x', title: 'x' }),
      exportFormats: [{ id: 'csv', label: 'CSV data', run: () => {} }],
      filters: <button aria-label="Filters" type="button" />,
      fullScreen: { isOpen: false, onToggle: () => {} },
    };
    const tableLike: SurfaceCapabilities = {
      buildReference: () => ({ markdown: 'x', summary: 'x', title: 'x' }),
      exportFormats: [{ id: 'csv', label: 'CSV data', run: () => {} }],
      fullScreen: { isOpen: false, onToggle: () => {} },
    };
    const first = render(withSelectionActions(<SurfaceToolbar capabilities={chartLike} />));
    const chartOrder = within(first.container)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));
    first.unmount();

    const second = render(withSelectionActions(<SurfaceToolbar capabilities={tableLike} />));
    const tableOrder = within(second.container)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));

    expect(chartOrder).toEqual(['Filters', 'Reference this', 'Full screen', 'More']);
    expect(tableOrder).toEqual(['Reference this', 'Full screen', 'More']);
  });
});
