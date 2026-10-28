import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { refreshAfterMemoryRemoval } from './memory-cache';
it('refreshes the memory list while its removed document observer is still mounted', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const read = vi.fn().mockResolvedValue({ name: 'removed' }),
    list = vi.fn().mockResolvedValue([]);
  const document = new QueryObserver(client, {
    queryKey: ['memory', 'document', 'removed'],
    queryFn: read,
  });
  const documents = new QueryObserver(client, { queryKey: ['memory', 'documents'], queryFn: list });
  const stopDocument = document.subscribe(() => {}),
    stopList = documents.subscribe(() => {});
  await document.refetch();
  await documents.refetch();
  const reads = read.mock.calls.length,
    lists = list.mock.calls.length;
  await refreshAfterMemoryRemoval(client, 'removed');
  expect(read).toHaveBeenCalledTimes(reads);
  expect(list.mock.calls.length).toBeGreaterThan(lists);
  stopDocument();
  stopList();
  client.clear();
});
