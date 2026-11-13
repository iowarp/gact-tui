import type { Connector, ConnectorScope, ConnectorValues } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';

/**
 * What a connector change makes stale: the connectors, the servers they start, the
 * tools, and the plugins that follow a connector into an agent.
 */
export const CONNECTOR_DEPENDENT_READS = [
  'connectors',
  'mcp-configurations',
  'mcp-servers',
  'tools',
  'plugins',
  'agents',
  'agent-resolution',
  'session-agent',
] as const;

/** Every connector with its state for the person asking (`GET /v1/connectors`). */
export function useConnectors(enabled = true) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: queryKeys.key('connectors', settings.endpoint, connectionScope(settings)),
    queryFn: ({ signal }) => repository.connectors(signal),
    enabled,
  });
}

/** One connector by id, from the same list. */
export function useConnector(id: string | undefined) {
  const connectors = useConnectors(Boolean(id));
  return {
    ...connectors,
    connector: id ? connectors.data?.find((row) => row.id === id) : undefined,
  };
}

/**
 * A connector's logo as an image address. The SVG is read through the repository (so
 * it carries the service's credentials on every transport) and shown in an `<img>`,
 * where it cannot run anything.
 */
export function useConnectorLogo(connector: Pick<Connector, 'id' | 'logo_url'>) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: queryKeys.key('connector-logo', settings.endpoint, connector.id, connector.logo_url),
    queryFn: async ({ signal }) =>
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        await repository.connectorLogo(connector.id, signal),
      )}`,
    enabled: Boolean(connector.logo_url),
    staleTime: Infinity,
    retry: false,
  });
}

export function useInvalidateConnectors() {
  const client = useQueryClient();
  const { settings } = useConnectionSettings();
  return () =>
    Promise.all(
      CONNECTOR_DEPENDENT_READS.map((key) =>
        client.invalidateQueries({ queryKey: queryKeys.key(key, settings.endpoint) }),
      ),
    );
}

/** Puts a connector the service answered with into the cached list at once. */
function useStoreConnector() {
  const client = useQueryClient();
  const { settings } = useConnectionSettings();
  return (next: Connector) =>
    client.setQueryData<Connector[]>(
      queryKeys.key('connectors', settings.endpoint, connectionScope(settings)),
      (rows) => rows?.map((row) => (row.id === next.id ? next : row)),
    );
}

export function useConnectorActions() {
  const repository = useRepository();
  const invalidate = useInvalidateConnectors();
  const store = useStoreConnector();
  const settle = async (connector: Connector) => {
    store(connector);
    await invalidate();
  };
  const save = useMutation({
    mutationFn: ({ id, values }: { id: string; values: ConnectorValues }) =>
      repository.setConnectorValues(id, values),
    onSuccess: settle,
    onError: (error: Error) =>
      toast.error('The values were not saved', { description: error.message }),
  });
  const enable = useMutation({
    mutationFn: ({ id, scope }: { id: string; scope: ConnectorScope }) =>
      repository.enableConnector(id, scope),
    onSuccess: settle,
    onError: (error: Error) =>
      toast.error('The connector was not enabled', { description: error.message }),
  });
  const disable = useMutation({
    mutationFn: (id: string) => repository.disableConnector(id),
    onSuccess: settle,
    onError: (error: Error) =>
      toast.error('The connector was not turned off', { description: error.message }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => repository.removeConnector(id),
    onSuccess: async () => {
      await invalidate();
    },
    onError: (error: Error) =>
      toast.error('The connector was not removed', { description: error.message }),
  });
  return { save, enable, disable, remove, invalidate };
}
