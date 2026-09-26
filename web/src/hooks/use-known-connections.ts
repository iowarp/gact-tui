import type { InfrastructureTarget } from '@clio/core/v3';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { createRepository, type SavedConnection } from '@/lib/connection';
import { vocab } from '@/lib/brand-vocabulary';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  connectionAvailability,
  useConnectionAvailabilities,
  type ConnectionAvailability,
} from '@/hooks/use-connection-availability';

export type KnownConnectionSource = 'recent' | 'managed' | 'infrastructure';

export interface KnownConnection extends SavedConnection {
  source: KnownConnectionSource;
  availability: ConnectionAvailability;
  /**
   * Only ever set for the `managed` source: the desktop supervisor hands out
   * a fresh bearer token per launch, so (unlike a `recent` entry, whose
   * token lives in secure storage, keyed by endpoint) it has to travel with
   * this synthesized row instead of being looked up.
   */
  token?: string;
}

const CONNECTED_TRANSPORT_STATES: ReadonlySet<InfrastructureTarget['transport_state']> = new Set([
  'connected',
]);

/**
 * The DEFAULT list an "Add an agent service" page shows: every CLIO the
 * person can click without typing an address, ahead of the manual
 * "Connect by address" form. Three real sources, no invented discovery:
 *
 * - `recent`: `recents` from `ConnectionProvider` (localStorage
 *   `clio.recent-connections`) with their existing live probe
 *   (`useConnectionAvailabilities`) — unchanged from before this hook.
 * - `managed`: the desktop-managed local service, once
 *   `ConnectionProvider` has resolved it. It is deliberately absent from
 *   `recents` (see that provider's `connect`), so it is synthesized here
 *   instead of probed — its state is already known from the boot handshake,
 *   not re-fetched over HTTP.
 * - `infrastructure`: CLIOs already deployed through Infrastructure that
 *   this device can currently reach — targets whose `transport_state` is
 *   already `'connected'` (attaching a NEW SSH transport is an action, not
 *   a passive listing, so a target requiring reauthentication is left for
 *   the Infrastructure page instead of prompted here). Read through the
 *   SAME controller repository `resolveConnection`'s infrastructure branch
 *   already talks to.
 *
 * No fourth "local services this device happens to be running" source: the
 * brief for it exists, but no discovery API exists to back it (Tauri exposes
 * only the ONE supervised local service, already covered by `managed`).
 */
export function useKnownConnections(): readonly KnownConnection[] {
  const { recents, managedConnection, managedConnectionReady, managedLabel } =
    useConnectionSettings();
  const recentAvailabilities = useConnectionAvailabilities(recents);
  const desktop = inTauri();

  const controllerRepository = useMemo(
    () => (desktop && managedConnection ? createRepository(managedConnection) : undefined),
    [desktop, managedConnection],
  );

  const targetsQuery = useQuery({
    enabled: Boolean(controllerRepository),
    // Matches `managed-services.tsx`'s own key shape for this same read — a
    // plain literal, not the shared `queryKeys` registry (that registry does
    // not carry infrastructure's own namespaces; this hook follows the
    // existing precedent rather than invent a second convention).
    queryKey: ['infrastructure-targets', managedConnection?.endpoint],
    queryFn: ({ signal }) => controllerRepository!.infrastructureTargets(signal),
    staleTime: 30_000,
  });

  const connectedTargets = useMemo(
    () => (targetsQuery.data ?? []).filter((target) => CONNECTED_TRANSPORT_STATES.has(target.transport_state)),
    [targetsQuery.data],
  );

  const catalogQueries = useQueries({
    queries: connectedTargets.map((target) => ({
      enabled: Boolean(controllerRepository),
      queryKey: ['managed-service-catalog', managedConnection?.endpoint, target.id],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        controllerRepository!.managedServiceCatalog(target.id, signal),
      staleTime: 30_000,
    })),
  });

  return useMemo(() => {
    const recentConnections: KnownConnection[] = recents.map((recent) => ({
      ...recent,
      source: 'recent',
      availability: connectionAvailability(recentAvailabilities, recent.endpoint),
    }));
    const knownEndpoints = new Set(recentConnections.map((connection) => connection.endpoint));

    const managed: KnownConnection[] = [];
    if (desktop && managedConnection && !knownEndpoints.has(managedConnection.endpoint)) {
      managed.push({
        endpoint: managedConnection.endpoint,
        token: managedConnection.token,
        label: managedLabel ?? 'This computer',
        location: 'This device',
        source: 'managed',
        availability: managedConnectionReady
          ? { state: 'healthy', label: 'Ready', detail: 'Running on this computer.' }
          : { state: 'checking', label: 'Starting', detail: 'Starting the local service.' },
      });
      knownEndpoints.add(managedConnection.endpoint);
    }

    const infrastructure: KnownConnection[] = [];
    connectedTargets.forEach((target, index) => {
      const catalog = catalogQueries[index]?.data;
      const service = catalog?.services.find((candidate) => candidate.id === 'clio_agent');
      if (!service || service.state !== 'running' || !service.connection_url) return;
      if (knownEndpoints.has(service.connection_url)) return;
      knownEndpoints.add(service.connection_url);
      infrastructure.push({
        endpoint: service.connection_url,
        label: vocab.agent,
        location: target.label,
        infrastructure: { targetId: target.id, serviceId: 'clio_agent' },
        source: 'infrastructure',
        availability: { state: 'healthy', label: 'Ready', detail: `Running on ${target.label}.` },
      });
    });

    return [...recentConnections, ...managed, ...infrastructure];
  }, [
    catalogQueries,
    connectedTargets,
    desktop,
    managedConnection,
    managedConnectionReady,
    managedLabel,
    recentAvailabilities,
    recents,
  ]);
}
