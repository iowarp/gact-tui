import type { SpotterAvailability } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useRepository } from './use-repository';

/**
 * Whether SPOTTER review can be armed in `workspaceId`, from the same service
 * check that refuses the transition. An empty `workspaceId` asks the
 * deployment-level question (session defaults, which serve every workspace).
 *
 * `undefined` while unknown (loading, or a service that predates the check):
 * the picker then keeps the option selectable and the service's typed refusal
 * remains the barrier.
 */
export function useSpotterAvailability(workspaceId: string): SpotterAvailability | undefined {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const availability = useQuery({
    queryKey: queryKeys.key('spotter-availability', settings.endpoint, workspaceId),
    queryFn: ({ signal }) => repository.spotterAvailability({ workspaceId }, signal),
    retry: false,
  });
  return availability.data;
}
