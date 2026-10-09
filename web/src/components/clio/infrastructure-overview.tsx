import type { InfrastructureInventory } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { LaptopIcon, ServerIcon, ArrowDownIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useRepository } from '@/hooks/use-repository';
import { useSavedServers } from '@/hooks/use-saved-servers';
import { useConnectionSettings } from '@/providers/connection-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ManagedServiceHostFacts } from './managed-service-host-facts';
import { displayHostPath } from '@/lib/host-path-display';
import { vocab } from '@/lib/brand-vocabulary';

/** Read actual capabilities from the same inspection/cache used by Services. */
export function InfrastructureHostInspection({ targetId }: { targetId: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const query = useQuery({
    queryKey: ['managed-service-catalog', settings.endpoint, targetId],
    queryFn: ({ signal }) => repository.managedServiceCatalog(targetId, signal),
    retry: false,
    staleTime: 30_000,
  });
  return (
    <section className="rounded-xl border p-4" aria-label="Computer capabilities">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Computer capabilities</h2>
        <Button
          size="sm"
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? 'Inspecting…' : 'Inspect again'}
        </Button>
      </div>
      {query.data ? (
        <>
          <ManagedServiceHostFacts facts={query.data.facts} />
          {query.data.facts.hostname ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Computer: {query.data.facts.hostname}
            </p>
          ) : null}
          {query.data.facts.home ? (
            <p className="mt-1 break-all text-xs text-muted-foreground">
              Home: {displayHostPath(query.data.facts.home)}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {query.error
            ? `Could not inspect this computer: ${query.error.message}`
            : 'Reading this computer’s capabilities…'}
        </p>
      )}
    </section>
  );
}

/** A read-only topology with real connection states and separate service ownership. */
export function InfrastructureOverview({
  data,
  targetId,
  onTarget,
}: {
  data: InfrastructureInventory;
  targetId: string;
  onTarget: (id: string) => void;
}) {
  const { settings } = useConnectionSettings();
  const { servers } = useSavedServers();
  const remote = data.targets.filter((target) => target.kind !== 'local');
  const height = Math.max(220, remote.length * 90);
  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-xl border bg-card p-4 sm:p-6" aria-label="Connection map">
        <h2 className="font-semibold">Connection map</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This client connects to {vocab.agent}. {vocab.agent} manages the computers and services
          shown here.
        </p>
        <div
          className="relative mt-6 grid items-center gap-4 sm:grid-cols-3 sm:gap-10"
          style={{ minHeight: height }}
        >
          <svg
            className="pointer-events-none absolute inset-0 hidden h-full w-full text-primary/40 sm:block"
            viewBox={`0 0 800 ${height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d={`M150 ${height / 2} H400`} fill="none" stroke="currentColor" strokeWidth="2" />
            {remote.map((host, index) => (
              <path
                key={host.id}
                d={`M450 ${height / 2} H555 V${((index + 0.5) * height) / remote.length} H720`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={host.transport_state === 'connected' ? undefined : '5 5'}
              />
            ))}
          </svg>
          <div className="relative rounded-xl border bg-background p-4 text-center">
            <LaptopIcon className="mx-auto mb-2 size-5 text-muted-foreground" />
            <p className="font-medium">This client</p>
            <p className="mt-1 text-xs text-muted-foreground">Desktop or browser</p>
          </div>
          <ArrowDownIcon className="mx-auto size-4 text-primary/60 sm:hidden" aria-hidden="true" />
          <Link
            to="/infrastructure/agent"
            className="relative rounded-xl border border-primary/40 bg-background p-4 text-center hover:bg-muted"
          >
            <ServerIcon className="mx-auto mb-2 size-5 text-primary" />
            <p className="font-medium">Connected {vocab.agent}</p>
            <p className="mt-2 break-all text-xs text-muted-foreground">{settings.endpoint}</p>
          </Link>
          <div className="relative grid gap-3">
            {remote.length ? (
              remote.map((host) => (
                <Link
                  key={host.id}
                  to={`/infrastructure/services?target=${encodeURIComponent(host.id)}`}
                  className="rounded-xl border bg-background p-4 hover:bg-muted"
                >
                  <p className="font-medium">{host.label}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{host.kind === 'ssh' ? 'SSH' : 'Endpoint'}</span>
                    <Badge variant="outline">{host.transport_state.replaceAll('_', ' ')}</Badge>
                  </div>
                </Link>
              ))
            ) : (
              <p className="rounded-xl border border-dashed bg-background p-4 text-sm text-muted-foreground">
                No other computers connected.
              </p>
            )}
          </div>
        </div>
      </section>
      <section className="space-y-3" aria-label="Computer inspection">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Inspect a computer</h2>
          <Select value={targetId} onValueChange={onTarget}>
            <SelectTrigger className="w-full sm:max-w-xs" aria-label="Inspection host">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.targets
                .filter((host) => host.kind !== 'direct')
                .map((host) => (
                  <SelectItem key={host.id} value={host.id}>
                    {host.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <InfrastructureHostInspection targetId={targetId} />
      </section>
      <section className="rounded-xl border" aria-label="Connected services">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <h2 className="font-semibold">Services and model servers</h2>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings/providers">Provider setup</Link>
          </Button>
        </div>
        <div className="divide-y">
          {data.services.map((service) => (
            <div className="flex flex-wrap items-center gap-3 p-4" key={service.id}>
              <span className="flex-1 font-medium">{service.service_id}</span>
              <span className="text-sm text-muted-foreground">
                {data.targets.find((host) => host.id === service.target_id)?.label ||
                  service.target_id}
              </span>
              <Badge variant="outline">{service.state}</Badge>
            </div>
          ))}
          {data.connections.map((connection) => (
            <div className="flex flex-wrap items-center gap-3 p-4" key={connection.id}>
              <span className="flex-1 font-medium">{connection.label}</span>
              <Badge variant="outline">
                {connection.reachable === undefined
                  ? 'Not checked'
                  : connection.reachable
                    ? 'Reachable'
                    : 'Not reachable'}
              </Badge>
            </div>
          ))}
          {(servers.data ?? []).map((server) => (
            <div className="flex flex-wrap items-center gap-3 p-4" key={server.id}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{server.label}</p>
                <p className="break-all text-xs text-muted-foreground">{server.address}</p>
              </div>
              <Badge variant="outline">
                {server.check
                  ? server.check.reachable
                    ? 'Reachable'
                    : 'Not reachable'
                  : 'Not checked'}
              </Badge>
              <Button asChild size="sm" variant="ghost">
                <Link to="/settings/providers">Manage</Link>
              </Button>
            </div>
          ))}
          {!data.services.length && !data.connections.length && !servers.data?.length ? (
            <p className="p-4 text-sm text-muted-foreground">
              No managed services or saved model servers yet.
            </p>
          ) : null}
          {servers.error ? (
            <p className="p-4 text-sm text-destructive">
              Saved model servers could not load: {servers.error.message}
            </p>
          ) : null}
        </div>
        <p className="border-t p-4 text-xs text-muted-foreground">
          Model servers saved in Provider setup or the model picker appear here. A model choice
          alone does not deploy a service.
        </p>
      </section>
      <Button asChild variant="outline">
        <Link to="/infrastructure/activity">View infrastructure activity</Link>
      </Button>
    </div>
  );
}
