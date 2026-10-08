import type { ServiceIntegrationHealth } from '@clio/core/v3';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';
import { foundationGroups } from './infrastructure-foundation';

/** Keep the group counts aligned with the live sandbox row after setup. */
export function InfrastructureFoundationGroups({
  integrations,
  renderRow,
}: {
  integrations: ServiceIntegrationHealth[];
  renderRow: (row: ServiceIntegrationHealth) => ReactNode;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const sandbox = useQuery({
    queryKey: queryKeys.key('sandbox-status', settings.endpoint),
    queryFn: ({ signal }) => repository.sandboxStatus(signal),
    enabled: integrations.some((row) => row.name === 'sandbox'),
  });
  const rows = integrations.map((row) =>
    row.name === 'sandbox' && sandbox.data ? { ...row, status: sandbox.data.status } : row,
  );
  const groups = foundationGroups(rows);
  return (
    <div className="space-y-3">
      {(['errors', 'warnings', 'ready'] as const).map((kind) => {
        const label =
          kind === 'ready' ? 'Ready and working' : kind === 'errors' ? 'Errors' : 'Warnings';
        return (
          <details
            key={kind}
            open={kind !== 'ready' && groups[kind].length > 0}
            className="rounded-lg border"
            aria-label={`${label} (${groups[kind].length})`}
          >
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              {label} ({groups[kind].length})
            </summary>
            <div className="divide-y border-t px-4">
              {groups[kind].map(renderRow)}
              {!groups[kind].length && (
                <p className="py-3 text-sm text-muted-foreground">None reported.</p>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
