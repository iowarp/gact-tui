import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { notOffered } from './settings-health-reason';

const REASON = 'not offered by this agent';
const ONCE = { staleTime: 5 * 60_000, retry: false } as const;

/**
 * Sections whose parts the connected agent does not offer, for the navigation to dim.
 * Shares the query keys the sections read, so opening one reuses the answer.
 */
export function useUnofferedSections(): Record<string, string> {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const runtime = useQuery({
    queryKey: queryKeys.key('runtime-settings', connectionScope(settings)),
    queryFn: ({ signal }) => repository.runtimeSettings(signal),
    ...ONCE,
  });
  const memory = useQuery({
    queryKey: queryKeys.key('memory-statistics', settings.endpoint),
    queryFn: ({ signal }) => repository.memoryStatistics(signal),
    ...ONCE,
  });
  const health = useQuery({
    queryKey: queryKeys.key('service-health', settings.endpoint),
    queryFn: ({ signal }) => repository.serviceHealth(signal),
    ...ONCE,
  });
  const dimmed: Record<string, string> = {};
  if (notOffered(runtime.error) && notOffered(memory.error)) dimmed.runtime = REASON;
  if (notOffered(health.error) && notOffered(memory.error)) dimmed.system = REASON;
  return dimmed;
}
