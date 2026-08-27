import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  artifactTablePreview: vi.fn().mockResolvedValue({
    artifact_id: 'artifact_series',
    name: 'positions.csv',
    columns: ['time', 'east', 'north'],
    rows: [
      { time: '2024-12-03', east: '-0.1', north: '0.2' },
      { time: '2024-12-12', east: '-0.05', north: '0.15' },
    ],
    total_rows: 250_000,
    sampled_rows: 2,
    truncated: true,
  }),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

import { ClioA2UITimeSeries } from './a2ui-time-series';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ClioA2UITimeSeries', () => {
  it('renders a registered CSV through the interactive shared plot', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ClioA2UITimeSeries
          accessibility={{ label: 'Position chart', description: 'Observed east and north values' }}
          dataUri="artifact://artifact_series"
          title="MTA1 position"
          xKey="time"
          yKeys={['east', 'north']}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('MTA1 position')).toBeInTheDocument();
    expect(screen.getByLabelText('Position chart')).toHaveAttribute(
      'aria-description',
      'Observed east and north values',
    );
    expect(screen.getByText(/2 evenly sampled rows from 250,000 total/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(repository.artifactTablePreview).toHaveBeenCalledWith(
        'artifact_series',
        ['time', 'east', 'north'],
        1_000,
        expect.any(AbortSignal),
      ),
    );
  });
});
