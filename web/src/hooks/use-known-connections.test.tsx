import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inTauri: false,
  recents: [] as Array<{
    endpoint: string;
    label?: string;
    infrastructure?: { targetId: string; serviceId: 'clio_agent' };
  }>,
  managedConnection: undefined as { endpoint: string; token?: string } | undefined,
  managedConnectionReady: false,
  repository: {
    capabilities: vi.fn(),
    serviceHealth: vi.fn(),
    infrastructureTargets: vi.fn(),
    managedServiceCatalog: vi.fn(),
  },
  resolveConnection: vi.fn(),
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => mocks.inTauri }));
vi.mock('@/lib/connection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/connection')>();
  return { ...actual, createRepository: () => mocks.repository };
});
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    recents: mocks.recents,
    managedConnection: mocks.managedConnection,
    managedConnectionReady: mocks.managedConnectionReady,
    resolveConnection: mocks.resolveConnection,
  }),
}));

import { useKnownConnections } from './use-known-connections';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inTauri = false;
  mocks.recents = [];
  mocks.managedConnection = undefined;
  mocks.managedConnectionReady = false;
  mocks.resolveConnection.mockResolvedValue({ endpoint: 'http://127.0.0.1:8788' });
  mocks.repository.capabilities.mockResolvedValue({ gact_versions: ['0.3'] });
  mocks.repository.serviceHealth.mockResolvedValue({ healthy: true, overall_status: 'healthy' });
  mocks.repository.infrastructureTargets.mockResolvedValue([]);
  mocks.repository.managedServiceCatalog.mockResolvedValue({ facts: {}, services: [] });
});

afterEach(cleanup);

describe('useKnownConnections', () => {
  it('is empty with nothing remembered, no managed service, and no reachable infrastructure', () => {
    const { result } = renderHook(() => useKnownConnections(), { wrapper });
    expect(result.current).toEqual([]);
  });

  it('lists a remembered connection with its live-probed availability', async () => {
    mocks.recents = [{ endpoint: 'http://127.0.0.1:8788', label: 'Homelab' }];
    const { result } = renderHook(() => useKnownConnections(), { wrapper });

    await waitFor(() =>
      expect(result.current.find((c) => c.endpoint === 'http://127.0.0.1:8788')?.availability.state).toBe(
        'healthy',
      ),
    );
    expect(result.current).toEqual([
      expect.objectContaining({
        endpoint: 'http://127.0.0.1:8788',
        label: 'Homelab',
        source: 'recent',
      }),
    ]);
  });

  it('lists the desktop-managed local service once it is resolved', () => {
    mocks.inTauri = true;
    mocks.managedConnection = { endpoint: 'http://127.0.0.1:53211', token: 'supervisor-token' };
    mocks.managedConnectionReady = true;

    const { result } = renderHook(() => useKnownConnections(), { wrapper });

    expect(result.current).toEqual([
      expect.objectContaining({
        endpoint: 'http://127.0.0.1:53211',
        token: 'supervisor-token',
        label: 'This computer',
        source: 'managed',
        availability: expect.objectContaining({ state: 'healthy' }),
      }),
    ]);
  });

  it('marks the managed service as starting, not ready, before the boot handshake finishes', () => {
    mocks.inTauri = true;
    mocks.managedConnection = { endpoint: 'http://127.0.0.1:53211' };
    mocks.managedConnectionReady = false;

    const { result } = renderHook(() => useKnownConnections(), { wrapper });

    expect(result.current[0]?.availability.state).toBe('checking');
  });

  it('never lists the managed service on the web build, even if somehow resolved', () => {
    mocks.inTauri = false;
    mocks.managedConnection = { endpoint: 'http://127.0.0.1:53211' };
    mocks.managedConnectionReady = true;

    const { result } = renderHook(() => useKnownConnections(), { wrapper });

    expect(result.current).toEqual([]);
  });

  it('lists a running CLIO deployed on an already-connected infrastructure target', async () => {
    mocks.inTauri = true;
    mocks.managedConnection = { endpoint: 'http://127.0.0.1:53211', token: 'controller-token' };
    mocks.managedConnectionReady = true;
    mocks.repository.infrastructureTargets.mockResolvedValue([
      { id: 'homelab', label: 'Homelab', kind: 'ssh', transport_state: 'connected' },
    ]);
    mocks.repository.managedServiceCatalog.mockResolvedValue({
      facts: {},
      services: [
        { id: 'clio_agent', state: 'running', connection_url: 'http://127.0.0.1:43123' },
      ],
    });

    const { result } = renderHook(() => useKnownConnections(), { wrapper });

    await waitFor(() =>
      expect(result.current.some((c) => c.source === 'infrastructure')).toBe(true),
    );
    expect(result.current).toContainEqual(
      expect.objectContaining({
        endpoint: 'http://127.0.0.1:43123',
        location: 'Homelab',
        source: 'infrastructure',
        infrastructure: { targetId: 'homelab', serviceId: 'clio_agent' },
      }),
    );
    expect(mocks.repository.managedServiceCatalog).toHaveBeenCalledWith('homelab', expect.anything());
  });

  it('never fetches a catalog for a target that still needs reauthentication', async () => {
    mocks.inTauri = true;
    mocks.managedConnection = { endpoint: 'http://127.0.0.1:53211' };
    mocks.managedConnectionReady = true;
    mocks.repository.infrastructureTargets.mockResolvedValue([
      { id: 'utah', label: 'Utah', kind: 'ssh', transport_state: 'reauthentication_required' },
    ]);

    const { result } = renderHook(() => useKnownConnections(), { wrapper });

    await waitFor(() => expect(mocks.repository.infrastructureTargets).toHaveBeenCalled());
    expect(mocks.repository.managedServiceCatalog).not.toHaveBeenCalled();
    expect(result.current.some((c) => c.source === 'infrastructure')).toBe(false);
  });

  it('does not duplicate an infrastructure CLIO already present as a recent connection', async () => {
    mocks.inTauri = true;
    mocks.recents = [{ endpoint: 'http://127.0.0.1:43123', label: 'Homelab', infrastructure: { targetId: 'homelab', serviceId: 'clio_agent' } }];
    mocks.managedConnection = { endpoint: 'http://127.0.0.1:53211' };
    mocks.managedConnectionReady = true;
    mocks.repository.infrastructureTargets.mockResolvedValue([
      { id: 'homelab', label: 'Homelab', kind: 'ssh', transport_state: 'connected' },
    ]);
    mocks.repository.managedServiceCatalog.mockResolvedValue({
      facts: {},
      services: [{ id: 'clio_agent', state: 'running', connection_url: 'http://127.0.0.1:43123' }],
    });

    const { result } = renderHook(() => useKnownConnections(), { wrapper });

    await waitFor(() => expect(mocks.repository.managedServiceCatalog).toHaveBeenCalled());
    const matches = result.current.filter((c) => c.endpoint === 'http://127.0.0.1:43123');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.source).toBe('recent');
  });
});
