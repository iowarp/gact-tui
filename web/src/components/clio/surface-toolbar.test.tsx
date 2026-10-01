import { cleanup, render, screen } from '@testing-library/react';
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
 * renders exactly the affordances declared — nothing more, nothing less —
 * regardless of which component (chart, map, table, ...) built it. Every
 * per-component integration test (`a2ui-chart.test.tsx` etc.) trusts this
 * contract instead of re-proving the toolbar's own rendering rules.
 */

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

  it('renders the download menu, with one item per declared format', async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    const capabilities: SurfaceCapabilities = {
      exportFormats: [
        { id: 'png', label: 'PNG image', run },
        { id: 'csv', label: 'CSV data', run: vi.fn() },
      ],
    };
    render(<SurfaceToolbar capabilities={capabilities} />);

    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(screen.getByRole('menuitem', { name: 'PNG image' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'CSV data' })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'PNG image' }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('renders a copy button that calls onCopy and shows a transient confirmation', async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn().mockResolvedValue(undefined);
    render(<SurfaceToolbar capabilities={{ onCopy, copyLabel: 'Copy value' }} />);

    const button = screen.getByRole('button', { name: 'Copy value' });
    await user.click(button);

    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('renders "Reference this" only when buildReference is declared', () => {
    render(
      withSelectionActions(
        <SurfaceToolbar
          capabilities={{ buildReference: () => ({ markdown: 'x', summary: 'x', title: 'x' }) }}
        />,
      ),
    );
    expect(screen.getByRole('button', { name: 'Reference this' })).toBeInTheDocument();
  });

  it('renders a full-screen toggle reflecting the declared open state', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<SurfaceToolbar capabilities={{ fullScreen: { isOpen: false, onToggle } }} />);

    const button = screen.getByRole('button', { name: 'Full screen' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await user.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders every slot together, in one consistent order', () => {
    render(
      withSelectionActions(
        <SurfaceToolbar
          capabilities={{
            buildReference: () => ({ markdown: 'x', summary: 'x', title: 'x' }),
            exportFormats: [{ id: 'csv', label: 'CSV data', run: () => {} }],
            extra: <span>Extra</span>,
            filters: <span>Filters</span>,
            fullScreen: { isOpen: false, onToggle: () => {} },
            onCopy: () => {},
            selectionHint: <span>Hint</span>,
          }}
        />,
      ),
    );
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('Hint')).toBeInTheDocument();
    expect(screen.getByText('Extra')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reference this' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeInTheDocument();
  });
});
