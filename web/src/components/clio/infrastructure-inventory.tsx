import { useQuery } from '@tanstack/react-query';
import { useInfrastructureState } from '@/hooks/use-infrastructure-state';
import { Link } from 'react-router-dom';
import { ServerIcon } from 'lucide-react';
import { vocab } from '@/lib/brand-vocabulary';
import type { ReactNode } from 'react';
import { useRepository } from '@/hooks/use-repository';
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
import { HostStorageSettings } from './host-storage-settings';
import { ModelAcquisitions } from './model-acquisition';
import { InfrastructureOverview, InfrastructureHostInspection } from './infrastructure-overview';

/** Inventory is independent from deployment forms and survives navigation. */
export function InfrastructureInventory({
  section,
  children,
}: {
  section: 'overview' | 'models' | 'activity' | 'hosts';
  children?: ReactNode;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [targetId, setTargetId] = useInfrastructureState(
    settings.endpoint,
    'model-storage-target',
    'local',
  );
  const inventory = useQuery({
    queryKey: ['infrastructure-inventory', settings.endpoint],
    queryFn: ({ signal }) => repository.infrastructureInventory(signal),
    refetchInterval: 5000,
  });
  if (inventory.error)
    return (
      <p role="alert" className="mt-6 text-destructive">
        {inventory.error.message}
      </p>
    );
  if (!inventory.data)
    return (
      <p role="status" className="mt-6 text-muted-foreground">
        Loading infrastructure…
      </p>
    );
  const data = inventory.data;
  if (section === 'models')
    return (
      <div className="mt-6 space-y-6">
        <Select value={targetId} onValueChange={setTargetId}>
          <SelectTrigger className="w-full sm:max-w-sm" aria-label="Storage host">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {data.targets
              .filter((host) => host.kind !== 'direct')
              .map((host) => (
                <SelectItem value={host.id} key={host.id}>
                  {host.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <InfrastructureHostInspection targetId={targetId} />
        <ModelAcquisitions
          key={`models:${targetId}`}
          targetId={targetId}
          hostLabel={data.targets.find((host) => host.id === targetId)?.label || targetId}
        />
        <HostStorageSettings key={targetId} targetId={targetId} />
      </div>
    );
  if (section === 'activity')
    return (
      <div className="mt-6 divide-y rounded-lg border">
        {!data.operations.length && !data.model_acquisitions.length ? (
          <p className="p-6 text-sm text-muted-foreground">No infrastructure operations yet.</p>
        ) : null}
        {data.model_acquisitions.map((model) => (
          <div className="space-y-2 p-4" key={`${model.target_id}:${model.id}`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">Download · {model.repository}</span>
              <span className="text-sm text-muted-foreground">
                {data.targets.find((host) => host.id === model.target_id)?.label || model.target_id}
              </span>
              <Badge variant="outline">{model.state}</Badge>
              <Button asChild variant="ghost" size="sm" className="ml-auto">
                <Link
                  to="/infrastructure/models"
                  onClick={() => setTargetId(model.target_id || 'local')}
                >
                  Inspect
                </Link>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {model.phase} · Last observed{' '}
              {new Date((model.observed_at ?? model.updated_at) * 1000).toLocaleString()}
            </p>
          </div>
        ))}
        {data.operations.map((operation) => (
          <details className="p-4" key={operation.id}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-3">
              <span className="font-medium">
                {operation.action} · {operation.service_id}
              </span>
              <span className="text-sm text-muted-foreground">
                {data.targets.find((host) => host.id === operation.target_id)?.label ??
                  operation.target_id}
              </span>
              <Badge className="ml-auto" variant="outline">
                {operation.state}
              </Badge>
            </summary>
            <p className="mt-3 text-sm">{operation.error || operation.progress}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(operation.updated_at).toLocaleString()}
            </p>
            {operation.logs ? (
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">
                {operation.logs}
              </pre>
            ) : null}
          </details>
        ))}
      </div>
    );
  if (section === 'hosts')
    return (
      <div className="mt-6 space-y-4">
        <details open className="rounded-xl border">
          <summary className="cursor-pointer p-4 font-medium">
            {data.targets.find((host) => host.kind === 'local')?.label ||
              `This ${vocab.agent}'s computer`}
            <span className="ml-3 text-xs font-normal text-muted-foreground">
              Connected {vocab.agent}
            </span>
          </summary>
          <div className="space-y-4 border-t p-4">{children}</div>
        </details>
        {data.targets
          .filter((host) => host.kind !== 'local')
          .map((host) => (
            <details className="rounded-xl border" key={host.id}>
              <summary className="flex cursor-pointer items-center gap-3 p-4">
                <ServerIcon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 font-medium">{host.label}</span>
                <Badge variant="outline">{host.transport_state.replaceAll('_', ' ')}</Badge>
              </summary>
              <div className="space-y-3 border-t p-4">
                <p className="break-all text-sm text-muted-foreground">
                  {host.ssh?.host || 'External endpoint'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Connection status is separate from the health of services on this computer.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/infrastructure/services?target=${encodeURIComponent(host.id)}`}>
                    Inspect and manage {host.label}
                  </Link>
                </Button>
              </div>
            </details>
          ))}
      </div>
    );
  return <InfrastructureOverview data={data} targetId={targetId} onTarget={setTargetId} />;
}
