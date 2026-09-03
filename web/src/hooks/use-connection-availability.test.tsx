import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: {
    capabilities: vi.fn(),
    serviceHealth: vi.fn(),
  },
  resolveConnection: vi.fn(),
}));

vi.mock('@/lib/connection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/connection')>();
  return { ...actual, createRepository: () => mocks.repository };
});
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ resolveConnection: mocks.resolveConnection }),
}));

import { probeConnection, useConnectionAvailabilities } from './use-connection-availability';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveConnection.mockResolvedValue({ endpoint: 'http://127.0.0.1:8788' });
  mocks.repository.capabilities.mockResolvedValue({ gact_versions: ['0.3'] });
  mocks.repository.serviceHealth.mockResolvedValue({ healthy: true, overall_status: 'healthy' });
});

afterEach(cleanup);

describe('connection availability probing', () => {
  it('retries a transient capability failure instead of caching a terminal lockout', async () => {
    mocks.repository.capabilities
      .mockRejectedValueOnce(new Error('warming up'))
      .mockResolvedValue({ gact_versions: ['0.3'] });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useConnectionAvailabilities([{ endpoint: 'http://127.0.0.1:8788' }]),
      { wrapper },
    );

    await waitFor(() => expect(result.current['http://127.0.0.1:8788']?.state).toBe('healthy'));
    expect(mocks.repository.capabilities).toHaveBeenCalledTimes(2);
    client.clear();
  });

  it('keeps caller cancellation neutral instead of manufacturing Unavailable', async () => {
    mocks.repository.capabilities.mockImplementation(
      (signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Cancelled by caller', 'AbortError')),
            { once: true },
          );
        }),
    );
    const controller = new AbortController();
    const pending = probeConnection({ endpoint: 'http://127.0.0.1:8788' }, controller.signal);

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('reports an unverifiable health response as limited rather than ready', async () => {
    mocks.repository.serviceHealth.mockRejectedValue(new Error('health route unavailable'));

    await expect(
      probeConnection({ endpoint: 'http://127.0.0.1:8788' }, new AbortController().signal),
    ).resolves.toEqual({
      state: 'degraded',
      label: 'Limited',
      detail: 'The service responded, but its health status could not be verified.',
    });
  });
});
