import { queryKeys } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';

/**
 * The service's capabilities and model configuration. `pollMs` re-reads the
 * capabilities on an interval, for a caller that uses them as a reachability probe.
 */
export function useWorkspaceCapabilities({ pollMs = false }: { pollMs?: number | false } = {}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const capabilities = useQuery({
    queryKey: queryKeys.key('capabilities', settings.endpoint),
    queryFn: ({ signal }) => repository.capabilities(signal),
    refetchInterval: pollMs,
  });
  const modelConfiguration = useQuery({
    queryKey: queryKeys.key('language-model-configuration', settings.endpoint),
    queryFn: ({ signal }) => repository.languageModelConfiguration(signal),
  });

  return { capabilities, modelConfiguration };
}
