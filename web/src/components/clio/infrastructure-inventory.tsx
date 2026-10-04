import { useQuery } from '@tanstack/react-query';
import { useInfrastructureState } from '@/hooks/use-infrastructure-state';
import { Link } from 'react-router-dom';
import { LaptopIcon, ServerIcon, ArrowRightIcon } from 'lucide-react';
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
import { InfoTip } from './info-tip';
import { vocab } from '@/lib/brand-vocabulary';

/** Inventory is independent from deployment forms and survives navigation. */
export function InfrastructureInventory({
  section,
}: {
  section: 'overview' | 'models' | 'activity' | 'hosts';
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
  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Connected {vocab.agent}</span>
        <code className="break-all">{settings.endpoint}</code>
        <InfoTip label="About infrastructure status">
          This inventory records the last observed state. Open a resource and inspect it to refresh
          its health. An SSH disconnection makes remote health unknown.
        </InfoTip>
      </div>
      {section === 'overview' ? (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer font-medium">Connection map</summary>
          <div className="mt-4 flex flex-wrap items-center gap-3" aria-label="Connection map">
            <span className="inline-flex items-center gap-2 rounded-lg border p-3">
              <LaptopIcon className="size-4" />
              This client
            </span>
            <ArrowRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            <Button asChild variant="outline">
              <Link to="/infrastructure/agent">
                <ServerIcon />
                Connected {vocab.agent}
              </Link>
            </Button>
            {data.targets
              .filter((host) => host.kind !== 'local')
              .map((host) => (
                <Button key={host.id} asChild variant="outline">
                  <Link to={`/infrastructure/services?target=${encodeURIComponent(host.id)}`}>
                    <ServerIcon />
                    {host.label}
                  </Link>
                </Button>
              ))}
          </div>
        </details>
      ) : null}
      <div className="divide-y rounded-lg border" aria-label="Execution hosts">
        {data.targets.map((host) => (
          <div className="flex flex-wrap items-center gap-3 p-4" key={host.id}>
            <ServerIcon className="size-5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{host.label}</p>
              <p className="text-sm text-muted-foreground">
                {host.kind === 'local'
                  ? `Runs beside the connected ${vocab.agent}`
                  : host.ssh?.host || host.ssh?.profile || 'External endpoint'}
              </p>
            </div>
            <Badge variant="outline">{host.transport_state.replaceAll('_', ' ')}</Badge>
            <Button asChild variant="ghost" size="sm">
              <Link to={`/infrastructure/services?target=${encodeURIComponent(host.id)}`}>
                Manage
              </Link>
            </Button>
          </div>
        ))}
      </div>
      {section === 'overview' ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['Services', data.services.length + data.connections.length, 'services'],
            [
              'Operations in progress',
              data.operations.filter((op) => ['running', 'queued'].includes(op.state)).length,
              'activity',
            ],
            [
              'Storage locations',
              data.targets.filter((host) => host.kind !== 'direct').length,
              'models',
            ],
          ].map(([label, count, path]) => (
            <Link
              key={path}
              to={`/infrastructure/${path}`}
              className="rounded-lg border p-4 hover:bg-muted/50 focus-visible:outline-ring"
            >
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{count}</p>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
