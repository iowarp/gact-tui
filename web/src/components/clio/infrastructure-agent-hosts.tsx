import type { ServiceHealth } from '@clio/core/v3';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { LoaderCircleIcon } from 'lucide-react';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';
import { RefreshIcon } from '@/lib/icon-vocabulary';
import { vocab } from '@/lib/brand-vocabulary';
import { foundationTitle, integrationStatus } from '@/routes/infrastructure-foundation';
import { InfrastructureFoundationGroups } from '@/routes/infrastructure-foundation-groups';
import { FoundationRow } from './infrastructure-foundation-row';
import { InfrastructureInventory } from './infrastructure-inventory';
import { InfraTabActions } from './infrastructure-tab-actions';
import { IconButton } from './primitives/icon-button';
import { StateView } from './primitives/state-view';
import { t, ph } from '@lingui/core/macro';

/**
 * The CLIO hosts tab: the connected agent's components grouped by what needs
 * attention, then the computers it uses. "Check again" re-reads both.
 */
export function InfrastructureAgentHosts({ health }: { health: UseQueryResult<ServiceHealth> }) {
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const integrations = health.data?.integrations ?? [];
  // Every integration in /v1/health belongs to the connected agent's own computer,
  // so its row is where the attention it raises is shown.
  const attention = integrations
    .filter(
      (integration) =>
        integration.required !== false && integrationStatus(integration.status) !== 'healthy',
    )
    .map((integration) => foundationTitle(integration.name));
  const checkAgain = () => {
    void health.refetch();
    void queryClient.invalidateQueries({
      queryKey: queryKeys.key('sandbox-status', settings.endpoint),
    });
    void queryClient.invalidateQueries({
      queryKey: ['infrastructure-inventory', settings.endpoint],
    });
  };
  return (
    <>
      <InfraTabActions>
        <IconButton
          disabled={health.isFetching}
          icon={
            health.isFetching ? (
              <LoaderCircleIcon className="motion-safe:animate-spin" />
            ) : (
              <RefreshIcon />
            )
          }
          label={t`Check again`}
          onClick={checkAgain}
        />
      </InfraTabActions>
      <InfrastructureInventory section="hosts" localAttention={attention}>
        {integrations.length ? (
          <InfrastructureFoundationGroups
            integrations={integrations}
            renderRow={(integration) => (
              <FoundationRow integration={integration} key={integration.name} />
            )}
          />
        ) : health.isPending ? (
          <StateView
            kind="loading"
            size="row"
            title={t`Checking ${ph({ agent: vocab.agent })} components`}
          />
        ) : health.data ? (
          <StateView
            kind="empty"
            size="row"
            title={t`No supporting-component details were reported.`}
          />
        ) : null}
      </InfrastructureInventory>
    </>
  );
}
