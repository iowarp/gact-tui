import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FileSourceView } from './file-source-view';

afterEach(cleanup);

it('draws a delimited file’s header line faint and leaves other sources plain', () => {
  render(<FileSourceView name="soil_sites.csv" content={'site_id,lat\n2015,41.82\n'} />);
  const csv = screen.getByRole('region', { name: 'Source of soil_sites.csv' });
  expect(csv).toHaveAttribute('data-header-row');
  expect(csv.className).toContain('[&_code>span:first-child_span]:text-faint!');
  expect(csv).toHaveTextContent('site_id,lat');
  cleanup();

  render(<FileSourceView name="main.py" content={'print(1)\n'} />);
  const python = screen.getByRole('region', { name: 'Source of main.py' });
  expect(python).not.toHaveAttribute('data-header-row');
  expect(python.className).not.toContain('text-faint');
});

it('numbers a data file’s lines like code, small or windowed, so rows keep their references', () => {
  const numbered = (region: HTMLElement) =>
    region.querySelector('code > span[class*="counter-increment"]') !== null;
  render(<FileSourceView name="soil_sites.csv" content={'site_id,lat\n2015,41.82\n'} />);
  expect(numbered(screen.getByRole('region', { name: 'Source of soil_sites.csv' }))).toBe(true);
  cleanup();

  const rows = Array.from({ length: 6000 }, (_, index) => `${index},${index * 2}`).join('\n');
  // jsdom lays nothing out; give the windowed list a viewport so it mounts its first rows.
  const size = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
  const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600);
  const rect = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(DOMRect.fromRect({ width: 600, height: 400 }));
  render(<FileSourceView name="large.csv" content={`id,value\n${rows}\n`} />);
  const large = screen.getByRole('region', { name: 'Source of large.csv' });
  expect(large).toHaveTextContent('id,value');
  expect(large.querySelector('[aria-hidden="true"]')).toHaveTextContent('1');
  size.mockRestore();
  width.mockRestore();
  rect.mockRestore();
});
