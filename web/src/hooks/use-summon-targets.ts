import type { SummonTargets } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';

/** What the person can `@`-summon in a conversation: its agent's subagents and MCP servers. */
export function useSummonTargets(sessionId: string): SummonTargets | undefined {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: queryKeys.key('summon-targets', settings.endpoint, sessionId),
    queryFn: ({ signal }) => repository.summonTargets(sessionId, signal),
    enabled: Boolean(sessionId),
  }).data;
}
