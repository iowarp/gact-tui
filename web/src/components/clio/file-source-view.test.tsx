import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

it('wraps standalone source by default with continuation rows hung past the numbers', () => {
  render(<FileSourceView name="main.py" content={'print(1)\n'} />);
  const python = screen.getByRole('region', { name: 'Source of main.py' });
  expect(python.className).toContain('[&_pre]:whitespace-pre-wrap');
  expect(python.className).toContain(
    '[&_pre_code>span]:[padding-left:calc(3rem_+_var(--indent,0ch))]',
  );
});

it('keeps a wrapped line’s indent: unbreakable, and continuation rows hang at its column', async () => {
  render(
    <FileSourceView name="main.py" content={'def main():\n    with open(path) as handle:\n'} />,
  );
  const python = screen.getByRole('region', { name: 'Source of main.py' });
  const indented = await waitFor(() => {
    const line = python.querySelectorAll<HTMLElement>('code > span')[1];
    expect(line?.style.getPropertyValue('--indent')).toBe('4ch');
    return line!;
  });
  const lead = indented.firstElementChild as HTMLElement;
  expect(lead.className).toBe('whitespace-pre');
  expect(lead.textContent).toBe('    ');
  // The copied text is the file's own text.
  expect(indented.textContent).toBe('    with open(path) as handle:');
  expect(
    python.querySelectorAll<HTMLElement>('code > span')[0]?.style.getPropertyValue('--indent'),
  ).toBe('');
});

it('colours a large code file in chunks while its rows stay windowed, and leaves data plain', async () => {
  const body = Array.from(
    { length: 3000 },
    (_, index) => `def step_${index}():\n    return ${index}`,
  );
  const size = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
  const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600);
  const rect = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(DOMRect.fromRect({ width: 600, height: 400 }));
  try {
    render(<FileSourceView name="large.py" content={`${body.join('\n')}\n`} />);
    const large = screen.getByRole('region', { name: 'Source of large.py' });
    expect(large).toHaveAttribute('data-slot', 'virtual-source');
    // Plain text first, in the same rows, then the theme's syntax colours.
    expect(large).toHaveTextContent('def step_0():');
    await waitFor(
      () => expect(large.querySelector('span[style*="--syntax-token-keyword"]')).not.toBeNull(),
      { timeout: 20_000 },
    );
    expect(large).toHaveTextContent('def step_0():');
    expect(large.querySelectorAll('[data-index]').length).toBeLessThan(200);
    cleanup();

    const rows = Array.from({ length: 6000 }, (_, index) => `${index},${index * 2}`).join('\n');
    render(<FileSourceView name="large.csv" content={`id,value\n${rows}\n`} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const csv = screen.getByRole('region', { name: 'Source of large.csv' });
    expect(csv.querySelector('span[style*="--syntax-"]')).toBeNull();
  } finally {
    size.mockRestore();
    width.mockRestore();
    rect.mockRestore();
  }
}, 30_000);
