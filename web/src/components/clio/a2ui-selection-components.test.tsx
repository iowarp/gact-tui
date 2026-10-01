import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./scientific-map-view', () => ({
  ClioScientificMapView: () => <div data-testid="map-canvas" />,
}));
// See a2ui-map-data-source.test.tsx for why the side list's virtualizer is
// stubbed to render every row in tests.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 56,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        size: 56,
        start: index * 56,
      })),
  }),
}));

import { ClioSelectableDataTable } from './a2ui-data-table';
import { ClioScientificMap } from './a2ui-map';

afterEach(cleanup);

const POINTS = [
  { id: 'MTA1', label: 'Mount Tam', latitude: 37.9, longitude: -122.6, category: 'north' },
  { id: 'PBO2', label: 'Parkfield', latitude: 35.9, longitude: -120.4, category: 'south' },
  { id: 'PBO3', label: 'Cholame', latitude: 35.7, longitude: -120.3, category: 'south' },
];

/** The locations list starts closed; these tests select points through it. */
function openLocationsList() {
  fireEvent.click(screen.getByRole('button', { name: 'Show the locations list' }));
}

function pressed(label: RegExp) {
  return screen.getByRole('button', { name: label }).getAttribute('aria-pressed');
}

describe('clio.map.v1 layout', () => {
  it('keeps the locations list closed until the reader asks for it', () => {
    render(<ClioScientificMap points={POINTS} />);
    const toggle = screen.getByRole('button', { name: 'Show the locations list' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /Parkfield/u })).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Parkfield/u })).toBeInTheDocument();
  });

  it('shows no selection count until something is selected', () => {
    const { rerender } = render(
      <ClioScientificMap
        componentId="map"
        points={POINTS}
        selection={{ field: 'id', values: [] }}
        setSelection={vi.fn()}
      />,
    );
    expect(screen.queryByText(/of 3 selected/u)).not.toBeInTheDocument();

    rerender(
      <ClioScientificMap
        componentId="map"
        points={POINTS}
        selection={{ field: 'id', values: ['PBO2'] }}
        setSelection={vi.fn()}
      />,
    );
    expect(screen.getByText('1 of 3 selected')).toBeInTheDocument();
  });
});

describe('clio.map.v1 selection', () => {
  it('keeps its own selection, starting at `selected`, when the selection is not bound', () => {
    render(<ClioScientificMap points={POINTS} selected="PBO2" />);
    openLocationsList();
    expect(pressed(/Parkfield/u)).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /Cholame/u }));

    expect(pressed(/Cholame/u)).toBe('true');
    expect(pressed(/Parkfield/u)).toBe('false');
  });

  it('writes a click to the bound selection, with itself as the source', () => {
    const setSelection = vi.fn();
    render(<ClioScientificMap componentId="map" points={POINTS} setSelection={setSelection} />);
    openLocationsList();

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
    openLocationsList();
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

  it('ignores a selection written for a different field even when values coincide', () => {
    // A selection keyed by "category" with value "PBO2" must never highlight
    // this map's "id"-keyed point of the same string — the two columns are
    // unrelated, and matching on value alone (ignoring `state.field`) would
    // wrongly link surfaces that were never bound to the same field.
    render(
      <ClioScientificMap
        componentId="map"
        points={POINTS}
        selection={{ field: 'category', values: ['PBO2'], source: 'chart' }}
        setSelection={vi.fn()}
      />,
    );
    openLocationsList();
    expect(POINTS.map((point) => pressed(new RegExp(point.label, 'u')))).toEqual([
      'false',
      'false',
      'false',
    ]);
  });

  it("prefers a dataUri point's own selectionValue over its synthetic id/label/category", () => {
    // A producer's dataset can have a real column literally named "id" for
    // `selectionField` (the earthquake fixture does this) — its value must
    // win over this point's synthetic display id, which happens to collide.
    const setSelection = vi.fn();
    const datasetPoints = [
      { id: 'synthetic-0', label: 'Station A', latitude: 1, longitude: 1, selectionValue: 'real-42' },
      { id: 'synthetic-1', label: 'Station B', latitude: 2, longitude: 2, selectionValue: 'real-43' },
    ];
    render(
      <ClioScientificMap
        componentId="map"
        points={datasetPoints}
        selection={{ field: 'id', values: ['real-42'] }}
        selectionField="id"
        setSelection={setSelection}
      />,
    );
    openLocationsList();
    expect(pressed(/Station A/u)).toBe('true');
    expect(pressed(/Station B/u)).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: /Station B/u }));
    expect(setSelection).toHaveBeenCalledWith({ field: 'id', values: ['real-43'], source: 'map' });
  });

  it('warns instead of silently no-oping when inline points cannot resolve a bound selectionField', () => {
    render(
      <ClioScientificMap
        componentId="map"
        points={POINTS}
        selectionField="magnitude"
        setSelection={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/have no.*magnitude.*value to select by/iu),
    ).toBeInTheDocument();
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

  it('shift-clicks a range of rows into the shared selection (a table zone)', () => {
    const setSelection = vi.fn();
    render(
      <ClioSelectableDataTable
        columns={['station', 'value']}
        componentId="table"
        rows={ROWS}
        setSelection={setSelection}
      />,
    );

    // A plain click sets the range's anchor at row 0 ("MTA1")...
    fireEvent.click(screen.getByText('MTA1'));
    // ...then a shift-click on the last row selects every row in between.
    const lastRow = screen.getAllByRole('row').slice(1).at(-1)!;
    fireEvent.click(lastRow, { shiftKey: true });

    expect(setSelection).toHaveBeenLastCalledWith({
      field: 'station',
      values: ['MTA1', 'PBO2', 'PBO2'],
      source: 'table',
    });
  });

  it('treats a shift-click with no prior plain click as an ordinary single-row click', () => {
    const setSelection = vi.fn();
    render(
      <ClioSelectableDataTable
        columns={['station', 'value']}
        componentId="table"
        rows={ROWS}
        setSelection={setSelection}
      />,
    );

    fireEvent.click(screen.getByText('MTA1'), { shiftKey: true });

    expect(setSelection).toHaveBeenLastCalledWith({
      field: 'station',
      values: ['MTA1'],
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

  it('ignores a bound selection on a different field even when its values coincide', () => {
    // A chart bound to "value" writing values=[2] must never highlight this
    // table's "station" column just because no row's station literally
    // reads "2" — the real risk is the reverse: a coincidental string match
    // across unrelated fields. Use a value that DOES appear in `station`
    // ("PBO2" contains no bare "2" as a column value, so pick a selection
    // field that isn't bound here at all) to prove the field gate, not the
    // value comparison, is what blocks the match.
    render(
      <ClioSelectableDataTable
        columns={['station', 'value']}
        componentId="table"
        rows={ROWS}
        selection={{ field: 'other-field', values: ['PBO2'], source: 'chart' }}
        setSelection={vi.fn()}
      />,
    );
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.every((row) => !row.hasAttribute('aria-selected'))).toBe(true);
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
