import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, type Dispatch, type SetStateAction } from 'react';

/** Keep non-secret management state while navigating, scoped to the connected CLIO. */
export function useInfrastructureState<T>(
  endpoint: string,
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const client = useQueryClient();
  const queryKey = ['infrastructure-view', endpoint, key];
  const query = useQuery<T>({
    queryKey,
    queryFn: () => initial,
    initialData: initial,
    enabled: false,
    gcTime: Infinity,
  });
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (value) => {
      client.setQueryData<T>(['infrastructure-view', endpoint, key], (previous) =>
        typeof value === 'function' ? (value as (previous: T) => T)(previous ?? initial) : value,
      );
    },
    [client, endpoint, key, initial],
  );
  return [query.data as T, set];
}
