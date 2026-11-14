import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ClioRasterViewport } from './a2ui-raster-viewport';

const repository = vi.hoisted(() => ({
  // A sample that never settles keeps the canvas out of the test.
  artifactRasterQuery: vi.fn(() => new Promise<never>(() => {})),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

afterEach(cleanup);

/**
 * React listens for wheel passively, so a JSX `onWheel` could not stop the
 * browser zooming the whole page on ctrl+wheel (or a trackpad pinch) and logged
 * "Unable to preventDefault inside passive event listener invocation" instead.
 */
it('captures ctrl+wheel for raster zoom and leaves a plain wheel to scroll the page', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ClioRasterViewport rasterUri="artifact://artifact_grid" title="Surface temperature" />
    </QueryClientProvider>,
  );
  const surface = screen.getByRole('img', {
    name: 'Surface temperature raster image',
  }).parentElement!;
  expect(fireEvent.wheel(surface, { deltaY: -120 })).toBe(true);
  expect(fireEvent.wheel(surface, { ctrlKey: true, deltaY: -120 })).toBe(false);
});

it('draws the frame the shared time selection picks and says which', async () => {
  repository.artifactRasterQuery.mockImplementationOnce(
    () =>
      Promise.resolve({
        width: 2,
        height: 1,
        extent: [259.875, 35.125, 289.875, 15.125],
        sourceBounds: [259.875, 35.125, 289.875, 15.125],
        sourceShape: [80, 120],
        xLabel: 'longitude',
        yLabel: 'latitude',
        frame: [{ dim: 'time', value: '2024-09-26T12:00:00Z', index: 12, count: 24 }],
        min: 96791,
        max: 101000,
        values: [96791, 101000],
      }) as never,
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ClioRasterViewport
        rasterUri="artifact://artifact_msl"
        title="Mean sea level pressure"
        variable="MSL"
        selection={{ field: 'time_utc', values: ['2024-09-26T12:00:00Z'], source: 'chart1' }}
        selectionField="time"
      />
    </QueryClientProvider>,
  );
  expect(repository.artifactRasterQuery).toHaveBeenLastCalledWith(
    'artifact_msl',
    expect.objectContaining({ variable: 'MSL', select: { time: '2024-09-26T12:00:00Z' } }),
    expect.anything(),
  );
  expect(await screen.findByText('time 2024-09-26T12:00:00Z (13 of 24)')).toBeInTheDocument();
});
