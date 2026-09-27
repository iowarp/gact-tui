import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./scientific-map-view', () => ({
  ClioScientificMapView: () => <div data-testid="map-canvas" />,
}));

import { ClioSelectableDataTable } from './a2ui-data-table';
import { ClioScientificMap } from './a2ui-map';

afterEach(cleanup);

const POINTS = [
  { id: 'MTA1', label: 'Mount Tam', latitude: 37.9, longitude: -122.6, category: 'north' },
  { id: 'PBO2', label: 'Parkfield', latitude: 35.9, longitude: -120.4, category: 'south' },
  { id: 'PBO3', label: 'Cholame', latitude: 35.7, longitude: -120.3, category: 'south' },
];

function pressed(label: RegExp) {
  return screen.getByRole('button', { name: label }).getAttribute('aria-pressed');
}

describe('clio.map.v1 selection', () => {
  it('keeps its own selection, starting at `selected`, when the selection is not bound', () => {
    render(<ClioScientificMap points={POINTS} selected="PBO2" />);
    expect(pressed(/Parkfield/u)).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /Cholame/u }));

    expect(pressed(/Cholame/u)).toBe('true');
    expect(pressed(/Parkfield/u)).toBe('false');
  });

  it('writes a click to the bound selection, with itself as the source', () => {
    const setSelection = vi.fn();
    render(<ClioScientificMap componentId="map" points={POINTS} setSelection={setSelection} />);

    fireEvent.click(screen.getByRole('button', { name: /Parkfield/u }));

    expect(setSelection).toHaveBeenCalledWith({ field: 'id', values: ['PBO2'], source: 'map' });
  });

  it('highlights every point the bound selection names, by id, label or category', () => {
    const setSelection = vi.fn();
    const { rerender } = render(
      <ClioScientificMap
        componentId="map"
        points={POINTS}
        selection={{ field: 'category', values: ['south'], source: 'chart' }}
        setSelection={setSelection}
      />,
    );
    expect(pressed(/Parkfield/u)).toBe('true');
    expect(pressed(/Cholame/u)).toBe('true');
    expect(pressed(/Mount Tam/u)).toBe('false');

    // A click selects by the bound field.
    fireEvent.click(screen.getByRole('button', { name: /Mount Tam/u }));
    expect(setSelection).toHaveBeenCalledWith({
      field: 'category',
      values: ['north'],
      source: 'map',
    });

    // An emptied selection clears the map.
    rerender(
      <ClioScientificMap
        componentId="map"
        points={POINTS}
        selection={{ field: 'id', values: [] }}
        setSelection={setSelection}
      />,
    );
    expect(POINTS.map((point) => pressed(new RegExp(point.label, 'u')))).toEqual([
      'false',
      'false',
      'false',
    ]);
  });
});

describe('clio.data-table.v1 selection', () => {
  const ROWS = [
    { station: 'MTA1', value: 1 },
    { station: 'PBO2', value: 2 },
    { station: 'PBO2', value: 3 },
  ];

  it('selects a clicked row by its key column and clears on a second click', () => {
    const setSelection = vi.fn();
    const { rerender } = render(
      <ClioSelectableDataTable
        columns={['station', 'value']}
        componentId="table"
        rows={ROWS}
        setSelection={setSelection}
      />,
    );

    fireEvent.click(screen.getByText('MTA1'));
    expect(setSelection).toHaveBeenLastCalledWith({
      field: 'station',
      values: ['MTA1'],
      source: 'table',
    });

    rerender(
      <ClioSelectableDataTable
        columns={['station', 'value']}
        componentId="table"
        rows={ROWS}
        selection={{ field: 'station', values: ['MTA1'], source: 'table' }}
        setSelection={setSelection}
      />,
    );
    fireEvent.click(screen.getByText('MTA1'));
    expect(setSelection).toHaveBeenLastCalledWith({
      field: 'station',
      values: [],
      source: 'table',
    });
  });

  it('highlights rows matching the bound selection, a numeric id included', () => {
    render(
      <ClioSelectableDataTable
        columns={['station', 'value']}
        componentId="table"
        rows={ROWS}
        selection={{ field: 'value', values: ['3'], source: 'chart' }}
        setSelection={vi.fn()}
      />,
    );
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((row) => row.getAttribute('aria-selected'))).toEqual([null, null, 'true']);
  });

  it('keeps a legacy static selection string harmless', () => {
    const action = vi.fn();
    render(
      <ClioSelectableDataTable
        action={action}
        columns={['station']}
        componentId="table"
        rows={ROWS}
        selection="single"
      />,
    );
    fireEvent.click(screen.getByText('MTA1'));
    expect(action).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getAllByRole('row')
        .slice(1)
        .every((row) => !row.hasAttribute('aria-selected')),
    ).toBe(true);
  });
});
