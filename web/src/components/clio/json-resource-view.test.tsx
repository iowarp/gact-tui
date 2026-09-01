import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { highlightCode } from '@/components/ai-elements/code-block';
import { tabularJsonDataset } from './json-resource-data';
import { ClioJsonResourceView } from './json-resource-view';

afterEach(cleanup);

describe('JSON resource view', () => {
  it('discovers a homogeneous record collection without dropping its source', async () => {
    const content = JSON.stringify({
      campaign: 'phenotype-2026',
      runs: [
        { mean_biomass: 113.82832450388318, run_id: 'run-021' },
        { mean_biomass: 113.01571430822567, run_id: 'run-022' },
      ],
    });
    expect(tabularJsonDataset(content, 'batch-005.json')).toMatchObject({
      columns: ['run_id', 'mean_biomass'],
      label: 'runs',
      totalRows: 2,
    });
    await primeJsonHighlight(content);

    const user = userEvent.setup();
    render(<ClioJsonResourceView content={content} title="batch-005.json" />);

    expect(screen.getByRole('tab', { name: 'Data' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('runs, 2 rows')).toBeVisible();
    expect(screen.getByText('run-021')).toBeVisible();
    expect(screen.getByText('113.828325')).toHaveAttribute('title', '113.82832450388318');

    await user.click(screen.getByRole('tab', { name: 'Source' }));
    expect(screen.getByRole('button', { name: 'Copy batch-005.json' })).toBeVisible();
    expect(screen.getByText(/phenotype-2026/u)).toBeVisible();
  });

  it('falls back to source when JSON has no tabular record collection', async () => {
    const content = '{"status":"complete"}';
    await primeJsonHighlight(content);
    render(<ClioJsonResourceView content={content} title="status.json" />);

    expect(screen.queryByRole('tab', { name: 'Data' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy status.json' })).toBeVisible();
  });

  it('does not discard mixed array entries to fabricate a table', () => {
    expect(tabularJsonDataset('[{"run_id":"run-021"},"unavailable"]', 'runs.json')).toBeUndefined();
  });
});

function primeJsonHighlight(content: string): Promise<void> {
  return new Promise((resolve) => {
    if (highlightCode(content, 'json', () => resolve())) resolve();
  });
}
