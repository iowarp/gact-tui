import { blueprintOperationPending } from '@clio/core/v3';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';

type OperationTarget = { sourceId?: string; blueprintId?: string; workspaceId?: string };

/** Poll one shared history per connection and reconcile a settled revision in every view. */
export function useBlueprintOperation(target: OperationTarget) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const client = useQueryClient();
  const owner = connectionScope(settings);
  const history = useQuery({
    queryKey: ['blueprint-operations', settings.endpoint, owner],
    queryFn: ({ signal }) => repository.blueprintOperations(signal),
    refetchInterval: 2000,
  });
  const operation = history.data?.find((row) => {
    if (target.sourceId) return row.target.source_id === target.sourceId;
    if (!target.blueprintId) return false;
    if (row.target.scope === 'workspace' && row.target.workspace_id !== target.workspaceId)
      return false;
    return (
      row.target.blueprint_id === target.blueprintId ||
      (target.blueprintId.includes('::') &&
        row.target.source_id === target.blueprintId.split('::')[1])
    );
  });
  const id = operation?.id;
  const status = operation?.status;
  useEffect(() => {
    if (!id || !status || ['waiting_for_turns', 'preparing', 'applying'].includes(status)) return;
    for (const namespace of [
      'agent-blueprints',
      'agent-blueprint-sources',
      'blueprint-files',
      'blueprint-file',
      'blueprint-authoring',
      'agents',
      'sessions',
      'capabilities',
    ]) {
      void client.invalidateQueries({ queryKey: [namespace, settings.endpoint] });
    }
  }, [client, id, status, settings.endpoint, owner]);
  return { operation, pending: blueprintOperationPending(operation), error: history.error };
}
