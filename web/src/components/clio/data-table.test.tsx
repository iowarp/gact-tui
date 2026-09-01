import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ClioDataTable, type ClioDataRow } from './data-table';

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
});
