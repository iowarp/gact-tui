import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { PREVIEW_ROW_LIMIT } from '@/lib/runtime-limits';
import { ClioCsvView } from './csv-view';
import { FileViewerFactsRegistry } from './file-viewer-facts';
import { readDenseGridText } from './primitives/dense-grid-data';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const csv = (rows: number) =>
  `station,depth\n${Array.from({ length: rows }, (_, index) => `MTA${index},${index / 4}`).join('\n')}`;

it('shows a bounded CSV as one windowed grid with its row count in the frame bar', () => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.slot === 'dense-grid' ? 600 : 0;
  });
  const register = vi.fn();
  const { container } = render(
    <FileViewerFactsRegistry.Provider value={register}>
      <ClioCsvView content={csv(PREVIEW_ROW_LIMIT + 50)} title="stations.csv" />
    </FileViewerFactsRegistry.Provider>,
  );
  const grid = screen.getByRole('grid', { name: 'stations.csv' });
  expect(grid).toHaveAttribute('aria-rowcount', String(PREVIEW_ROW_LIMIT + 1));
  expect(within(grid).getAllByRole('row').length).toBeLessThan(100);
  expect(register).toHaveBeenCalledWith(expect.any(String), [
    `${PREVIEW_ROW_LIMIT.toLocaleString()}+ rows`,
  ]);
  expect(screen.getByRole('status')).toHaveTextContent(
    `Preview limited to the first ${PREVIEW_ROW_LIMIT.toLocaleString()} rows.`,
  );
  expect(screen.queryByText(/Rows per page/u)).not.toBeInTheDocument();
  // Copy reads every parsed row, not only the mounted ones.
  const lines = readDenseGridText(container)?.split('\n');
  expect(lines).toHaveLength(PREVIEW_ROW_LIMIT + 1);
  expect(lines?.[0]).toBe('station\tdepth');
  expect(lines?.at(-1)).toBe(`MTA${PREVIEW_ROW_LIMIT - 1}\t${(PREVIEW_ROW_LIMIT - 1) / 4}`);
});

it('keeps the CSV parse log behind one compact status control', async () => {
  const user = userEvent.setup();
  render(<ClioCsvView content={'station,depth\nMTA1,1,extra\nMTA2,2\n'} title="bad.csv" />);
  expect(screen.getByRole('grid', { name: 'bad.csv' })).toHaveTextContent('MTA2');
  const log = screen.getByRole('button', { name: /CSV parse log \(1\)/u });
  await act(async () => {
    await user.click(log);
  });
  expect(await screen.findByText(/Too many fields/u)).toBeVisible();
  expect(screen.getByText(/do not modify the source file/u)).toBeVisible();
});
