import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { InfrastructureOperation } from '@clio/core/v3';
import { useRepository } from './use-repository';

/** Restore server-owned operations after navigation, reconnect or a page reload. */
export function useManagedOperations(endpoint: string, targetId: string) {
  const repository = useRepository();
  const client = useQueryClient();
  const inventory = useQuery({
    queryKey: ['infrastructure-inventory', endpoint],
    queryFn: ({ signal }) => repository.infrastructureInventory(signal),
    // Closely while an operation is underway; otherwise a slow check for ones started elsewhere.
    refetchInterval: (query) =>
      query.state.data?.operations.some((row) => row.state === 'queued' || row.state === 'running')
        ? 3000
        : 30_000,
  });
  const rows = inventory.data?.operations.filter((row) => row.target_id === targetId) ?? [];
  const revision = rows
    .map((row) => `${row.id}:${row.state}`)
    .sort()
    .join('|');
  useEffect(() => {
    if (revision)
      void client.invalidateQueries({ queryKey: ['managed-service-catalog', endpoint, targetId] });
  }, [client, endpoint, targetId, revision]);
  const running: Record<string, InfrastructureOperation> = {};
  for (const row of rows)
    if (row.state === 'queued' || row.state === 'running') running[row.service_id] = row;
  return running;
}
