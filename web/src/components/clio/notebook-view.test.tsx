import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import '../ai-elements/markdown';
import { FileTextView } from './file-text-view';

afterEach(cleanup);

const notebook = JSON.stringify({
  nbformat: 4,
  nbformat_minor: 5,
  metadata: { kernelspec: { display_name: 'Python 3 (ipykernel)', language: 'python' } },
  cells: [
    { cell_type: 'markdown', source: '# Vertical displacement\n\nDaily **solutions**.' },
    {
      cell_type: 'code',
      execution_count: 2,
      source: 'summary',
      outputs: [
        { output_type: 'stream', name: 'stdout', text: '4 stations\n' },
        { output_type: 'stream', name: 'stderr', text: 'DtypeWarning: mixed types\n' },
        {
          output_type: 'execute_result',
          execution_count: 2,
          data: {
            'text/plain': 'station P395',
            'text/html':
              '<style scoped>.dataframe th { vertical-align: middle; }</style><table><tr><th>station</th></tr><tr><td>P395</td></tr></table><img src="x" onerror="window.ran = true">',
          },
        },
        {
          output_type: 'display_data',
          data: {
            'text/plain': 'FloatSlider(value=0.5)',
            'text/html': '<div id="w"></div><script>window.ran = true</script>',
          },
        },
        {
          output_type: 'display_data',
          data: { 'image/png': 'iVBORw0KGgo=', 'text/plain': '<Figure size 700x325>' },
        },
      ],
    },
    {
      cell_type: 'code',
      execution_count: 3,
      source: 'daily.loc["P999"]',
      outputs: [
        {
          output_type: 'error',
          ename: 'KeyError',
          evalue: "'P999'",
          traceback: ["\u001b[0;31mKeyError\u001b[0m: 'P999'"],
        },
      ],
    },
    { cell_type: 'code', execution_count: null, source: 'summary.to_parquet()', outputs: [] },
  ],
});

// The reader and its Markdown renderer load lazily; a cold jsdom import can take seconds.
const LAZY = { timeout: 10_000 };

describe('notebook reader', { timeout: 30_000 }, () => {
  it('reads cells in order with run counts, outputs and errors; Source keeps the JSON', async () => {
    const user = userEvent.setup();
    render(<FileTextView content={notebook} mediaType="" name="opal.ipynb" />);
    const cells = await screen.findByRole('list', { name: 'Cells of opal.ipynb' }, LAZY);
    expect(
      within(cells)
        .getAllByRole('listitem')
        .map((cell) => cell.getAttribute('aria-label')),
    ).toEqual([
      'Cell 1, text',
      'Cell 2, code, run 2',
      'Cell 3, code, run 3',
      'Cell 4, code, not run',
    ]);
    expect(
      await within(cells).findByRole('heading', { name: 'Vertical displacement' }, LAZY),
    ).toBeVisible();
    const summary = within(cells).getByRole('listitem', { name: 'Cell 2, code, run 2' });
    expect(within(summary).getByText('[2]')).toBeInTheDocument();
    expect(within(summary).getByText('4 stations')).toBeVisible();
    expect(within(summary).getByRole('group', { name: 'Standard error' })).toHaveTextContent(
      'DtypeWarning: mixed types',
    );
    expect(await within(summary).findByRole('cell', { name: 'P395' }, LAZY)).toBeVisible();
    expect(summary.querySelector('[onerror]')).toBeNull();
    expect(summary.textContent).not.toContain('vertical-align');
    // Script-driven output shows its plain text instead of an empty sanitized shell.
    expect(within(summary).getByText('FloatSlider(value=0.5)')).toBeVisible();
    expect(summary.querySelector('script')).toBeNull();
    expect(within(summary).getByRole('img', { name: 'Figure from cell 2' })).toHaveAttribute(
      'src',
      'data:image/png;base64,iVBORw0KGgo=',
    );
    const error = within(cells).getByRole('group', { name: 'Error: KeyError' });
    expect(error).toHaveTextContent("KeyError: 'P999'");
    expect(error.textContent).not.toContain('\u001b');

    await user.click(screen.getByRole('tab', { name: 'Source' }));
    expect(await screen.findByRole('region', { name: 'Source of opal.ipynb' })).toHaveTextContent(
      '"nbformat"',
    );
  });

  it('says why a cut-off notebook cannot be read and shows its source', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <FileTextView content={notebook.slice(0, 200)} name="draft.ipynb" />
      </TooltipProvider>,
    );
    expect(await screen.findByText("Couldn't read it", {}, LAZY)).toBeVisible();
    expect(screen.getByText('The file isn’t complete JSON.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Show source' }));
    expect(screen.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('region', { name: 'Source of draft.ipynb' })).toBeVisible();
  });

  it('names an empty notebook and shows its source', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <FileTextView content='{"nbformat": 4, "cells": []}' name="untitled.ipynb" />
      </TooltipProvider>,
    );
    expect(await screen.findByText('This notebook has no cells', {}, LAZY)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Show source' }));
    expect(await screen.findByRole('region', { name: 'Source of untitled.ipynb' })).toBeVisible();
  });
});
