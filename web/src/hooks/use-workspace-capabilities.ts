import { queryKeys } from '@/lib/query-keys';
import { QUERY_RESULT_FIELDS } from '@/lib/query-notify';
import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useProviderCatalog } from './use-provider-catalog';

/**
 * The service's capabilities and model configuration. `pollMs` re-reads the
 * capabilities on an interval, for a caller that uses them as a reachability probe;
 * as a function it picks the interval from whether the last read failed.
 */
export function useWorkspaceCapabilities({
  pollMs = false,
}: { pollMs?: number | false | ((failed: boolean) => number | false) } = {}) {
  useProviderCatalog();
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const capabilities = useQuery({
    queryKey: queryKeys.key('capabilities', settings.endpoint),
    queryFn: ({ signal }) => repository.capabilities(signal),
    refetchInterval:
      typeof pollMs === 'function' ? (query) => pollMs(query.state.status === 'error') : pollMs,
  });
  const modelConfiguration = useQuery({
    queryKey: queryKeys.key('language-model-configuration', settings.endpoint),
    queryFn: ({ signal }) => repository.languageModelConfiguration(signal),
    notifyOnChangeProps: QUERY_RESULT_FIELDS,
  });

  return { capabilities, modelConfiguration };
}
