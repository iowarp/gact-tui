import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => ({}) }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
const mounts = vi.hoisted(() => ({ count: 0 }));
vi.mock('./scientific-map-view', async () => {
  const react = await import('react');
  return {
    ClioScientificMapView: () => {
      react.useEffect(() => {
        mounts.count += 1;
      }, []);
      return <div data-testid="map-canvas" />;
    },
  };
});
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 32,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 32, size: 32 })),
    measureElement: () => undefined,
    scrollToIndex: () => undefined,
  }),
}));

import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from '@/lib/a2ui/kernel-catalog';

const CATALOG_ID = 'test://a2ui-map-renderer-mount';

describe('clio.map.v1 renderer', () => {
  it('keeps the map mounted across re-renders after the renderer finishes loading', async () => {
    const catalog = new Catalog(CATALOG_ID, [...KERNEL_COMPONENTS.values()], [...KERNEL_FUNCTIONS.values()]);
    const processor = new MessageProcessor([catalog], async () => undefined, { version: 'v0.9.1' });
    processor.processMessages([
      { version: 'v0.9.1', createSurface: { surfaceId: 'map-surface', catalogId: CATALOG_ID } },
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId: 'map-surface',
          components: [
            { id: 'root', component: 'Column', children: ['map'] },
            {
              id: 'map',
              component: 'clio.map.v1',
              points: [
                { id: 's1', label: 'Station 1', latitude: 1, longitude: 2 },
                { id: 's2', label: 'Station 2', latitude: 3, longitude: 4 },
              ],
            },
          ],
        },
      },
    ] as A2uiMessage[]);
    const surface = processor.model.getSurface('map-surface');
    if (!surface) throw new Error('Expected the test surface to exist');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();

    // Rendered before any preload: the renderer arrives through the lazy fallback.
    render(
      <QueryClientProvider client={client}>
        <A2uiSurface surface={surface} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('map-canvas')).toBeInTheDocument());
    expect(mounts.count).toBe(1);

    // Any later re-render of the map (here, showing its locations list) keeps the same instance.
    const map = document.querySelector('[data-slot="a2ui-map"]') as HTMLElement;
    await user.click(within(map).getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Show locations list' }));
    await waitFor(() =>
      expect(map.querySelector('[data-slot="a2ui-map-points-list"]')).toBeInTheDocument(),
    );
    expect(mounts.count).toBe(1);
  });
});
