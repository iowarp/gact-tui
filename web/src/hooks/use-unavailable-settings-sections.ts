import { TransportError } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { usePromptRegistrySupported } from '@/hooks/use-session-agent';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';

const notOffered = (error: unknown) =>
  error instanceof TransportError && [404, 405, 501].includes(error.status ?? 0);

/**
 * Settings sections the connected service doesn't offer, each with the reason
 * its dimmed nav item gives on hover. An unknown answer dims nothing.
 */
export function useUnavailableSettingsSections(): Record<string, string> {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const prompts = usePromptRegistrySupported();
  // The same read Data sources makes, so opening the section reuses it.
  const accounts = useQuery({
    queryKey: ['connected-storage', connectionScope(settings), 'accounts'],
    queryFn: ({ signal }) => repository.storageProviders(signal),
    retry: false,
    staleTime: 30_000,
  });
  const unavailable: Record<string, string> = {};
  if (prompts === false) unavailable.prompts = 'This service doesn’t offer prompt families.';
  if (notOffered(accounts.error))
    unavailable['data-sources'] = 'This service doesn’t offer data sources.';
  return unavailable;
}
