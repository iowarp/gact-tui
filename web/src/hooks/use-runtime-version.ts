import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { displayReleaseVersion } from '@/lib/release-version';
import { useConnectionSettings } from '@/providers/connection-provider';

/**
 * The connected agent's release version, read from the same capabilities
 * entry every other surface uses, so opening a menu never adds a request
 * when the answer is already cached.
 */
export function useRuntimeVersion(): { version?: string; pending: boolean } {
  const repository = useRepository();
  const { credentialsReady = true, settings } = useConnectionSettings();
  const capabilities = useQuery({
    enabled: credentialsReady,
    queryKey: queryKeys.key('capabilities', settings.endpoint),
    queryFn: ({ signal }) => repository.capabilities(signal),
  });
  return {
    version: displayReleaseVersion(capabilities.data?.service?.version),
    pending: capabilities.isPending,
  };
}
