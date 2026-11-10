import { useMemo } from 'react';
import { toast } from 'sonner';
import { useConnectionAvailabilities } from '@/hooks/use-connection-availability';
import { useKnownConnections } from '@/hooks/use-known-connections';
import { useSwitchConnection } from '@/hooks/use-switch-connection';
import type { ConnectionSettings } from '@/lib/connection';
import { useConnectionSettings } from '@/providers/connection-provider';

/** What the CLIO menu lists: the agent in use, the saved agents, their reachability and the switch. */
export function useClioMenuConnections(endpoint: string) {
  const { settings } = useConnectionSettings();
  const connections = useKnownConnections();
  const activeConnection = useMemo(() => [{ ...settings, endpoint }], [endpoint, settings]);
  const activeAvailability = useConnectionAvailabilities(activeConnection);
  const connectionAvailabilities = useMemo(
    () => ({
      ...Object.fromEntries(
        connections.map((connection) => [connection.endpoint, connection.availability]),
      ),
      ...activeAvailability,
    }),
    [activeAvailability, connections],
  );
  const switchConnection = useSwitchConnection();
  const onConnect = async (connection: ConnectionSettings) => {
    try {
      await switchConnection(connection);
    } catch (error) {
      toast.error('Could not switch agent service', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };
  return { settings, connections, connectionAvailabilities, onConnect };
}
