import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';

/** The MCP services the person saved, here or with `clio-agent mcp add`. */
export function useSavedMcpServices() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: queryKeys.key('mcp-configurations', settings.endpoint, connectionScope(settings)),
    queryFn: ({ signal }) => repository.savedMcpServices(signal),
  });
}
