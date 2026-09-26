import { useMutation } from '@tanstack/react-query';
import { serverCheckResult } from '@/lib/local-servers';
import { useRepository } from './use-repository';

/**
 * Check whether a server answers at an address, and how many models it
 * serves: one live handshake of the provider against that address
 * (`refresh=true`, so never a cached answer). Nothing is saved.
 */
export function useServerCheck(presetId: string) {
  const repository = useRepository();
  return useMutation({
    mutationFn: async (address: string) =>
      serverCheckResult(await repository.providerHandshake(presetId, { apiBase: address, refresh: true })),
  });
}
