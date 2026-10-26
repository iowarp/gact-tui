import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { createSessionReadQueue } from '../session-resource-loading';

const repository = vi.hoisted(() => ({
  a2uiCatalogs: vi.fn().mockResolvedValue({ rows: [], rejected: [] }),
  a2uiCapabilities: vi.fn().mockResolvedValue({ agent: { 'v0.9': { supportedCatalogIds: [] } } }),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
import { useA2uiSessionRegistry } from './processor-store';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('keeps current and pending-interaction registries immediate while staging other descendants', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const load = createSessionReadQueue(2);
  const view = renderHook(
    ({ enabled }) =>
      useA2uiSessionRegistry(['parent', 'question', 'old-child'], {
        enabled,
        load,
        immediateIds: ['parent', 'question'],
      }),
    { wrapper, initialProps: { enabled: false } },
  );
  try {
    await waitFor(() => expect(repository.a2uiCatalogs).toHaveBeenCalledTimes(2));
    expect(repository.a2uiCatalogs.mock.calls.map(([id]) => id)).toEqual(['parent', 'question']);
    expect(repository.a2uiCapabilities).toHaveBeenCalledTimes(2);
    view.rerender({ enabled: true });
    await waitFor(() => expect(repository.a2uiCapabilities).toHaveBeenCalledTimes(3));
    expect(repository.a2uiCatalogs).toHaveBeenLastCalledWith('old-child', expect.any(AbortSignal));
  } finally {
    view.unmount();
    client.clear();
  }
});
