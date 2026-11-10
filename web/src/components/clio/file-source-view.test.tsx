import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
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
