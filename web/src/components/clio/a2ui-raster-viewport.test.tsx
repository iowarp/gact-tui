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
  const surface = screen.getByRole('img', { name: 'Surface temperature raster image' })
    .parentElement!;
  expect(fireEvent.wheel(surface, { deltaY: -120 })).toBe(true);
  expect(fireEvent.wheel(surface, { ctrlKey: true, deltaY: -120 })).toBe(false);
});
