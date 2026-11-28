import type { ServiceHealth, ServiceIntegrationHealth } from '@clio/core/v3';

/**
 * The `/v1/health` row that says CLIO's default agents failed to install, so no
 * conversation can start with them. Its `summary` is the service's own sentence;
 * its `next_action` names a route and is never shown.
 */
export function unavailableDefaultMarketplace(
  health: ServiceHealth | undefined,
): (ServiceIntegrationHealth & { text: string }) | undefined {
  const row = health?.integrations.find(
    (item) =>
      item.name === 'default_marketplace' && item.reason === 'default_marketplace_unavailable',
  );
  const text = row?.summary || row?.detail;
  return row && text ? { ...row, text } : undefined;
}
