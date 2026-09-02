import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { invalidateQueriesInBackground } from './query-invalidation';

describe('invalidateQueriesInBackground', () => {
  it('does not reject an accepted action when reconciliation is unavailable', async () => {
    const queryClient = new QueryClient();
    const failure = new Error('service briefly unavailable');
    const invalidate = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined);

    expect(invalidateQueriesInBackground(queryClient, [['first'], ['second']])).toBeUndefined();

    await Promise.resolve();

    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenNthCalledWith(1, { queryKey: ['first'] });
    expect(invalidate).toHaveBeenNthCalledWith(2, { queryKey: ['second'] });
  });
});
