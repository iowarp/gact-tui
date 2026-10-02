import { createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ClioDataTable, type ClioDataRow, type ClioDataTableServerControl } from './data-table';

/** A brand-new server control object every render — the churn a live A2UI/query-client re-render produces. */
function ServerDrivenHarness({ nonce }: { nonce: number }) {
  const server: ClioDataTableServerControl = {
    columnKind: () => 'text',
    filters: new Map(),
    onFilterChange: () => {},
    onPaginationChange: () => {},
    onSortChange: () => {},
    pageIndex: 0,
    pageSize: 50,
    totalRows: 2,
  };
  return (
    <ClioDataTable
      columns={[{ key: 'station', label: 'station' }]}
      rows={[{ station: `A-${nonce}` }, { station: 'B' }]}
      server={server}
    />
  );
}

describe('ClioDataTable', () => {
  it('paginates the ReUI grid and exposes wide columns through a scroll region', async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 15 }, (_, index) => ({
      station: `station-${index + 1}`,
      longitude: -118.2 + index / 100,
      provenance: `catalog-record-${index + 1}`,
    }));

    render(
      <ClioDataTable
        columns={['station', 'longitude', 'provenance']}
        label="Station catalog"
        rows={rows}
      />,
    );

    expect(screen.getByRole('region', { name: 'Station catalog columns' })).toHaveClass(
      'overflow-x-auto',
    );
    expect(screen.getByRole('separator', { name: 'Resize station' })).toBeInTheDocument();
    expect(screen.getByText('station-1')).toBeVisible();
    expect(screen.queryByText('station-11')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '2' }));

    expect(screen.getByText('11 - 15 of 15')).toBeVisible();
    expect(screen.getByText('station-11')).toBeVisible();
    expect(screen.queryByText('station-1')).not.toBeInTheDocument();
  });

  it('exposes row activation to keyboard users', async () => {
    const user = userEvent.setup();
    const selected: ClioDataRow[] = [];

    render(
      <ClioDataTable
        columns={['station']}
        onRowClick={(row) => selected.push(row)}
        rows={[{ station: 'MTA1' }]}
      />,
    );

    const row = screen.getByText('MTA1').closest('tr');
    expect(row).toHaveAttribute('tabindex', '0');
    row?.focus();
    await user.keyboard('{Enter}');

    expect(selected).toEqual([{ station: 'MTA1' }]);
  });

  it('prevents text selection during shift-click multi-row selection', () => {
    const selected: Array<{ row: ClioDataRow; shiftKey: boolean }> = [];
    const { container } = render(
      <ClioDataTable
        columns={['station']}
        onRowClick={(row, context) => selected.push({ row, shiftKey: context.shiftKey })}
        rows={[{ station: 'MTA1' }, { station: 'MTA2' }]}
      />,
    );

    const row = container.querySelector('tbody tr');
    expect(row).not.toBeNull();
    const mouseDown = createEvent.mouseDown(row!, { shiftKey: true });
    fireEvent(row!, mouseDown);
    fireEvent.click(row!, { shiftKey: true });

    expect(mouseDown.defaultPrevented).toBe(true);
    expect(selected).toEqual([{ row: { station: 'MTA1' }, shiftKey: true }]);
  });

  // Regression for #1533: a server-driven column's header dropdown (filter +
  // sort menu) was being discarded and remounted — not toggled closed — by
  // any unrelated re-render that rebuilt the `columns` array (TanStack v9
  // rebuilds its table/column wrapper objects on every render; the real
  // failure came from the A2UI/ARC/query-client stack's own re-render churn
  // on top of that). `flexRender` instantiates `column.columnDef.header` BY
  // REFERENCE, so an inline arrow `header`/`cell` loses its previous
  // instance's state (the dropdown's open flag) the moment that reference
  // changes. See `ClioColumnHeaderCell` in `data-table.tsx`.
  it('keeps a column header dropdown open across a full columns-array rebuild', async () => {
    const user = userEvent.setup();
    // Scoped to this render's own container: earlier tests in this file
    // leave their DOM mounted (no global RTL `cleanup()` is registered here),
    // and more than one of them renders a same-named "station" column.
    const { container, rerender } = render(<ServerDrivenHarness nonce={0} />);

    await user.click(within(container).getByRole('button', { name: 'station' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // Re-render with brand-new `columns`/`server` object and function
    // references — the exact churn the real regression reproduced under —
    // without any DOM event Radix would read as an outside interaction.
    rerender(<ServerDrivenHarness nonce={1} />);

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter station, contains')).toBeInTheDocument();
  });
});
