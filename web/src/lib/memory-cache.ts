import type { QueryClient } from '@tanstack/react-query';

/** Refresh lists after deletion without asking an open viewer to refetch its removed document. */
export async function refreshAfterMemoryRemoval(client: QueryClient, name: string): Promise<void> {
  await client.cancelQueries({ queryKey: ['memory', 'document', name], exact: true });
  await client.invalidateQueries({
    queryKey: ['memory'],
    predicate: (query) => !(query.queryKey[1] === 'document' && query.queryKey[2] === name),
  });
}
