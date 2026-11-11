import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DenseGrid } from './dense-grid';
import { denseGridText, readDenseGridText } from './dense-grid-data';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const columns = [
  { key: 'site_id', label: 'site_id' },
  { key: 'lat', label: 'lat' },
  { key: 'network', label: 'network' },
];
const sites = [
  { site_id: 2015, lat: 41.82, network: 'SCAN' },
  { site_id: 2017, lat: 40.11, network: 'USCRN' },
  { site_id: 2031, lat: 39.78, network: null },
];

it('renders a sticky header, a row-number gutter and every small row without pagination', () => {
  render(<DenseGrid columns={columns} label="soil_sites.csv" rows={sites} />);
  const grid = screen.getByRole('grid', { name: 'soil_sites.csv' });
  expect(grid).toHaveAttribute('aria-rowcount', '4');
  expect(
    within(grid)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent),
  ).toEqual(['Row', 'site_id', 'lat', 'network']);
  expect(
    within(grid)
      .getAllByRole('rowheader')
      .map((cell) => cell.textContent),
  ).toEqual(['1', '2', '3']);
  expect(within(grid).getAllByRole('row')).toHaveLength(4);
  expect(grid).toHaveTextContent('41.82');
  expect(screen.queryByText(/Rows per page/u)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /next page/iu })).not.toBeInTheDocument();
});

it('mounts only the rows in view for a large table', () => {
  // jsdom has no layout: give the grid's scroll viewport a 600 px window.
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.slot === 'dense-grid' ? 600 : 0;
  });
  const rows = Array.from({ length: 50_000 }, (_, index) => ({
    site_id: index,
    lat: index / 100,
    network: index % 2 ? 'SCAN' : 'USCRN',
  }));
  render(<DenseGrid columns={columns} label="large.csv" rows={rows} />);
  const grid = screen.getByRole('grid', { name: 'large.csv' });
  expect(grid).toHaveAttribute('aria-rowcount', '50001');
  const mounted = within(grid).getAllByRole('row').length - 1;
  expect(mounted).toBeGreaterThan(0);
  expect(mounted).toBeLessThan(100);
  const body = within(grid).getAllByRole('rowgroup')[1];
  expect(body.style.height).toBe(`${50_000 * 28}px`);
  // Copy builds its text from the rows, not from the mounted DOM.
  const text = readDenseGridText(grid.parentElement);
  expect(text?.split('\n')).toHaveLength(50_001);
});

it('sorts ascending, descending, then back to file order, marking only the sorted column', () => {
  render(<DenseGrid columns={columns} label="soil_sites.csv" rows={sites} />);
  const lat = screen.getByRole('button', { name: 'lat' });
  const header = lat.closest('[role="columnheader"]') as HTMLElement;
  const firstColumn = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('gridcell')[1].textContent);
  expect(header).not.toHaveAttribute('aria-sort');
  expect(header.querySelector('svg')).toBeNull();

  fireEvent.click(lat);
  expect(header).toHaveAttribute('aria-sort', 'ascending');
  expect(header.querySelector('svg')).not.toBeNull();
  expect(firstColumn()).toEqual(['39.78', '40.11', '41.82']);
  // Rows keep their number in the file while sorted.
  expect(screen.getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual(['3', '2', '1']);

  fireEvent.click(lat);
  expect(header).toHaveAttribute('aria-sort', 'descending');
  expect(firstColumn()).toEqual(['41.82', '40.11', '39.78']);

  fireEvent.click(lat);
  expect(header).not.toHaveAttribute('aria-sort');
  expect(firstColumn()).toEqual(['41.82', '40.11', '39.78']);
  expect(screen.getByRole('columnheader', { name: 'site_id' })).not.toHaveAttribute('aria-sort');
});

it('selects a cell with the pointer and moves it with arrow keys', () => {
  render(<DenseGrid columns={columns} label="soil_sites.csv" rows={sites} />);
  const grid = screen.getByRole('grid');
  fireEvent.mouseDown(screen.getByText('40.11'));
  const selected = () => grid.querySelector('[aria-selected="true"]');
  expect(selected()).toHaveTextContent('40.11');
  expect(grid.getAttribute('aria-activedescendant')).toBe(selected()?.id);
  fireEvent.keyDown(grid, { key: 'ArrowDown' });
  expect(selected()).toHaveTextContent('39.78');
  fireEvent.keyDown(grid, { key: 'ArrowRight' });
  expect(selected()).toHaveTextContent('');
  fireEvent.keyDown(grid, { key: 'Home', ctrlKey: true });
  expect(selected()).toHaveTextContent('2015');
  fireEvent.keyDown(grid, { key: 'Escape' });
  expect(selected()).toBeNull();
});

it('writes tab-separated text of all rows in display order', () => {
  expect(denseGridText(columns, sites, [2, 0, 1])).toBe(
    'site_id\tlat\tnetwork\n2031\t39.78\t\n2015\t41.82\tSCAN\n2017\t40.11\tUSCRN',
  );
  expect(denseGridText([{ key: 'note', label: 'note' }], [{ note: 'a\tb "c"' }])).toBe(
    'note\n"a\tb ""c"""',
  );
});
