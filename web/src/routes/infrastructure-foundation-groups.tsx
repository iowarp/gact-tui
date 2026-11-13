import type { ServiceIntegrationHealth } from '@clio/core/v3';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';
import { InfraList } from '@/components/clio/infrastructure-row';
import { foundationGroups } from './infrastructure-foundation';
import { t } from '@lingui/core/macro';

const GROUP_LABELS = {
  errors: t`Errors`,
  warnings: t`Warnings`,
  ready: t`Ready and working`,
} as const;

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
    <div className="flex min-w-0 flex-col gap-1">
      {(['errors', 'warnings', 'ready'] as const).map((kind) =>
        groups[kind].length ? (
          <InfraList
            heading={GROUP_LABELS[kind]}
            // Same columns as Computers below, so every status lines up.
            hover={52}
            key={kind}
            meta={0}
          >
            {groups[kind].map(renderRow)}
          </InfraList>
        ) : null,
      )}
    </div>
  );
}
