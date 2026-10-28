import type { InfrastructureInventory } from '@clio/core/v3';
import { ArrowDownIcon, ArrowRightIcon, LaptopIcon, ServerIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { vocab } from '@/lib/brand-vocabulary';
import {
  infrastructureServiceName,
  computerConnectionLabel,
} from '@/lib/infrastructure-service-labels';
import { managedServiceStatus } from '@/lib/managed-service-status';
import { InfoTip } from './info-tip';

/**
 * This client → the connected agent → the remote computers it manages, as one flat
 * row of columns: spacing and arrows carry the order, not nested framed boxes.
 */
export function InfrastructureTopology({
  data,
  agentLabel,
  endpoint,
}: {
  data: InfrastructureInventory;
  agentLabel: string;
  endpoint: string;
}) {
  const remote = data.targets.filter((target) => target.kind === 'ssh');
  const local = data.targets.find((target) => target.kind === 'local');
  const servicesOn = (targetId: string) => {
    const rows = data.services.filter((row) => row.target_id === targetId);
    if (!rows.length) return null;
    return (
      <ul className="mt-2 space-y-1 text-xs" aria-label="Services">
        {rows.map((service) => (
          <li key={service.id} className="flex items-center justify-between gap-3">
            <span>{infrastructureServiceName(service.service_id)}</span>
            <span className="text-muted-foreground">{managedServiceStatus(service).label}</span>
          </li>
        ))}
      </ul>
    );
  };
  const step = (
    <>
      <ArrowRightIcon
        className="hidden size-4 self-center text-muted-foreground md:block"
        aria-hidden="true"
      />
      <ArrowDownIcon className="size-4 text-muted-foreground md:hidden" aria-hidden="true" />
    </>
  );
  return (
    <section aria-label="Connection map" className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Your setup</h2>
        <InfoTip label="About the connection map">
          Select a computer to manage its services. Arrows show management connections, not which
          services your agent uses.
        </InfoTip>
      </div>
      <div
        role="list"
        aria-label="Connections from this client to the agent and managed computers"
        className="grid gap-4 border-y py-5 md:grid-cols-[minmax(0,0.7fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-6"
      >
        <div role="listitem" className="flex items-start gap-3">
          <LaptopIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">This client</p>
            <p className="mt-1 text-xs text-muted-foreground">Desktop or browser</p>
          </div>
        </div>
        {step}
        <div role="listitem" className="min-w-0">
          <Link
            to="/infrastructure/services?target=local"
            aria-label={`Manage services on connected ${vocab.agent}`}
            className="group flex items-start gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ServerIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-primary">Connected {vocab.agent}</p>
              <p className="font-semibold group-hover:underline group-hover:underline-offset-4">
                {agentLabel}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground" title={endpoint}>
                {endpoint}
              </p>
            </div>
          </Link>
          <div className="pl-7">{servicesOn(local?.id ?? 'local')}</div>
        </div>
        {step}
        <div role="listitem" className="min-w-0">
          <p className="flex items-center gap-3 text-sm font-medium">
            <ServerIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            Remote computers
          </p>
          <div className="mt-2 space-y-3 pl-7">
            {remote.map((host) => (
              <div key={host.id} className="min-w-0">
                <Link
                  to={`/infrastructure/services?target=${encodeURIComponent(host.id)}`}
                  className="block truncate text-sm font-medium hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {host.label}
                </Link>
                <p className="text-xs text-muted-foreground">
                  SSH: {computerConnectionLabel(host.transport_state)}
                </p>
                {servicesOn(host.id)}
              </div>
            ))}
            {!remote.length ? (
              <p className="text-sm text-muted-foreground">
                None added.{' '}
                <Link
                  to="/infrastructure/agent"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Manage computers
                </Link>
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Arrows show management connections. Installed services and selected connections are
        separate.
      </p>
    </section>
  );
}
