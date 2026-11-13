import type { SystemRepository } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useRepository } from './use-repository';

type FleetSettingsInput = Parameters<SystemRepository['updateFleetSettings']>[0];

/**
 * The agent's global fleet settings (fast model, helper models, Explore
 * suggestion): one cached read shared by Settings and search, and the save
 * that replaces it with what the agent returns.
 */
export function useFleetSettings() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const client = useQueryClient();
  const key = ['fleet-settings', settings.endpoint, connectionScope(settings)];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => repository.fleetSettings(signal),
  });
  const save = useMutation({
    mutationFn: (input: FleetSettingsInput) => repository.updateFleetSettings(input),
    onSuccess: (data) => client.setQueryData(key, data),
  });
  return { query, save };
}
